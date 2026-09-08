"""Cache Open Library covers for books.csv so BookFeed works offline.

books.csv has no ISBNs, so this script performs one-time title + author searches.
Downloaded files are named by book_id and are never requested by the browser again.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BOOKS_FILE = PROJECT_ROOT / "data" / "books.csv"
COVERS_DIR = PROJECT_ROOT / "frontend" / "public" / "book-covers"
MAPPING_FILE = COVERS_DIR / "cover-map.json"
USER_AGENT = "BookFeedPortfolio/1.0 (local educational cover cache)"


def request_json(url: str, timeout: float = 15.0) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def download(url: str, destination: Path, timeout: float = 20.0) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    temporary = destination.with_suffix(destination.suffix + ".part")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get("Content-Type", "")
        if not content_type.startswith("image/"):
            raise ValueError(f"Unexpected content type: {content_type}")
        temporary.write_bytes(response.read())
    temporary.replace(destination)


def find_open_library_cover(title: str, author: str) -> int | None:
    query = urllib.parse.urlencode({"title": title, "author": author, "limit": 5, "fields": "cover_i,title,author_name"})
    payload = request_json(f"https://openlibrary.org/search.json?{query}")
    for document in payload.get("docs", []):
        cover_id = document.get("cover_i")
        if isinstance(cover_id, int):
            return cover_id
    return None


def fetch_covers(limit: int | None, delay: float, overwrite: bool) -> dict[str, str]:
    books = pd.read_csv(BOOKS_FILE)
    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = {}
    if MAPPING_FILE.exists():
        try:
            mapping = json.loads(MAPPING_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            mapping = {}

    attempted = 0
    for row in books.itertuples(index=False):
        book_id = str(int(row.book_id)) if isinstance(row.book_id, float) and row.book_id.is_integer() else str(row.book_id)
        destination = COVERS_DIR / f"{book_id}.jpg"
        if destination.exists() and not overwrite:
            mapping[book_id] = f"/book-covers/{destination.name}"
            continue
        if limit is not None and attempted >= limit:
            break
        attempted += 1
        try:
            cover_id = find_open_library_cover(str(row.title), str(row.author))
            if cover_id is None:
                print(f"No cover: {row.title} — {row.author}")
                mapping[book_id] = "/book-covers/default.svg"
            else:
                download(f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg", destination)
                mapping[book_id] = f"/book-covers/{destination.name}"
                print(f"Cached: {row.title}")
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            print(f"Skipped: {row.title} ({exc})")
            mapping[book_id] = "/book-covers/default.svg"
        MAPPING_FILE.write_text(json.dumps(mapping, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        time.sleep(max(0.0, delay))
    return mapping


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None, help="Only attempt this many uncached books")
    parser.add_argument("--delay", type=float, default=0.35, help="Seconds between Open Library lookups")
    parser.add_argument("--overwrite", action="store_true", help="Replace covers that are already cached")
    args = parser.parse_args()
    mapping = fetch_covers(args.limit, args.delay, args.overwrite)
    cached = sum(1 for value in mapping.values() if value != "/book-covers/default.svg")
    print(f"Finished. {cached} cached covers; missing books use default.svg.")


if __name__ == "__main__":
    main()
