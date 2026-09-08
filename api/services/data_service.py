"""Read the book/post catalog and convert CSV rows into API objects."""

import csv
import colorsys
import hashlib
import threading
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd

from api.config import Settings


def _string_id(value) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _avatar_color(value: str) -> str:
    digest = int(hashlib.sha1(value.encode("utf-8")).hexdigest()[:8], 16)
    hue = (digest % 360) / 360
    red, green, blue = colorsys.hls_to_rgb(hue, 0.40, 0.28)
    return f"#{round(red * 255):02x}{round(green * 255):02x}{round(blue * 255):02x}"


class DataRepository:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._post_write_lock = threading.Lock()
        self.books = pd.read_csv(settings.books_path)
        self.posts = pd.read_csv(settings.posts_path)
        self.books["_id"] = self.books["book_id"].map(_string_id)
        self.posts["_id"] = self.posts["post_id"].map(_string_id)
        self.posts["_book_id"] = self.posts["book_id"].map(_string_id)
        self.posts["_user_id"] = self.posts["user_id"].map(_string_id)
        self._books = {row["_id"]: row for _, row in self.books.iterrows()}
        self._posts = {row["_id"]: row for _, row in self.posts.iterrows()}
        self._content_types = self._load_content_types(settings.processed_posts_path)

    @staticmethod
    def _load_content_types(path: Path) -> dict[str, str]:
        if not path.exists():
            return {}
        frame = pd.read_csv(path, usecols=lambda name: name in {"post_id", "content_type"})
        if "content_type" not in frame.columns:
            return {}
        return {
            _string_id(row["post_id"]): str(row["content_type"])
            for _, row in frame.iterrows()
        }

    @property
    def related_post_count(self) -> int:
        return int((self.posts["is_book_related"].astype(int) == 1).sum())

    def has_post(self, post_id: str) -> bool:
        return str(post_id) in self._posts

    def has_book(self, book_id: str) -> bool:
        return str(book_id) in self._books

    def book_row(self, book_id: str):
        return self._books.get(str(book_id))

    def post_row(self, post_id: str):
        return self._posts.get(str(post_id))

    def related_posts(self):
        return self.posts[self.posts["is_book_related"].astype(int) == 1]

    def cover_path(self, book_id: str) -> str:
        for suffix in ("jpg", "jpeg", "png", "webp"):
            if (self.settings.covers_path / f"{book_id}.{suffix}").exists():
                return f"/book-covers/{book_id}.{suffix}"
        return "/book-covers/default.svg"

    def book_dict(self, book_id: str) -> dict | None:
        row = self.book_row(book_id)
        if row is None:
            return None
        genre = str(row["genre"])
        genres = [part.strip() for part in genre.replace("/", ",").split(",") if part.strip()]
        return {
            "id": row["_id"],
            "title": str(row["title"]),
            "author": str(row["author"]),
            "genres": genres or [genre],
            "description": str(row["description"]),
            "year": None,
            "cover_url": self.cover_path(row["_id"]),
        }

    def post_dict(self, post_id: str) -> dict | None:
        row = self.post_row(post_id)
        if row is None:
            return None
        nickname = str(row["nickname"])
        return {
            "id": row["_id"],
            "user_id": row["_user_id"],
            "username": nickname.replace("_", " ").title(),
            "handle": nickname,
            "avatar_color": _avatar_color(nickname),
            "book_id": row["_book_id"],
            "text": str(row["content"]),
            "word_count": len(str(row["content"]).split()),
            "created_at": str(row["published_at"]),
            "likes": int(row["like_count"]),
            "comments": int(row["comment_count"]),
            "saves": 0,
            "kind": self._content_types.get(row["_id"], "discussion"),
        }

    def event_text(self, row: dict[str, str]) -> str:
        if row.get("query"):
            return self.query_context(row["query"])
        post = self.post_row(row.get("post_id", ""))
        book_id = row.get("book_id") or (post["_book_id"] if post is not None else "")
        book = self.book_row(book_id)
        pieces: list[str] = []
        if book is not None:
            pieces.extend([str(book["title"]), str(book["author"]), str(book["genre"]), str(book["description"])])
        if post is not None:
            pieces.append(str(post["content"]))
        return " ".join(pieces)

    def query_context(self, query: str) -> str:
        """Expand names/titles into catalog language represented by post vectors."""
        matching = self.search_books(query, limit=8)
        if not matching:
            return query
        descriptions = " ".join(
            f"{book['title']} by {book['author']}. {book['description']}"
            for book in matching
        )
        return f"{query}. {descriptions}"

    def profile_terms(self, rows: list[dict[str, str]]) -> list[str]:
        terms: list[str] = []
        for row in rows:
            if row.get("query"):
                terms.append(row["query"])
            post = self.post_row(row.get("post_id", ""))
            book_id = row.get("book_id") or (post["_book_id"] if post is not None else "")
            book = self.book_row(book_id)
            if book is not None:
                terms.extend([str(book["title"]), str(book["author"]), str(book["genre"])])
        unique_terms = []
        for term in terms:
            if term and term not in unique_terms:
                unique_terms.append(term)
        return unique_terms

    def search_books(self, query: str, limit: int = 12) -> list[dict]:
        term = query.casefold().strip()
        frame = self.books
        if term:
            searchable = (
                frame["title"].astype(str)
                + " "
                + frame["author"].astype(str)
                + " "
                + frame["genre"].astype(str)
                + " "
                + frame["description"].astype(str)
            ).str.casefold()
            frame = frame[searchable.str.contains(term, regex=False)]
        return [self.book_dict(row["_id"]) for _, row in frame.head(limit).iterrows()]

    def user_post_ids(self, user_id: str, limit: int = 20) -> list[str]:
        frame = self.posts[self.posts["_user_id"] == str(user_id)].sort_values("published_at", ascending=False)
        return frame["_id"].head(limit).tolist()

    def create_post(self, user_id: str, nickname: str, book_id: str, text: str) -> str:
        """Append one user-created post safely and update the in-memory CSV view."""
        columns = [
            "post_id", "user_id", "nickname", "book_id", "content", "published_at",
            "view_count", "like_count", "comment_count", "repost_count", "is_book_related",
            "writing_style", "content_length",
        ]
        with self._post_write_lock:
            # The API uses one process, so this lock also protects ID generation.
            next_id = max((int(post_id) for post_id in self._posts), default=500000) + 1
            post_id = str(next_id)
            word_count = len(text.split())
            if word_count < 35:
                length = "short"
            elif word_count < 90:
                length = "medium"
            else:
                length = "long"

            row = {
                "post_id": post_id,
                "user_id": str(user_id),
                "nickname": nickname,
                "book_id": str(book_id),
                "content": text,
                "published_at": datetime.now(timezone.utc).isoformat(),
                "view_count": "0",
                "like_count": "0",
                "comment_count": "0",
                "repost_count": "0",
                "is_book_related": "1",
                "writing_style": "user",
                "content_length": length,
            }
            with self.settings.posts_path.open("a", newline="", encoding="utf-8") as handle:
                csv.DictWriter(handle, fieldnames=columns).writerow(row)

            # Update memory too, so the new post appears without restarting the API.
            stored = dict(row)
            stored["_id"] = post_id
            stored["_book_id"] = str(book_id)
            stored["_user_id"] = str(user_id)
            self.posts = pd.concat([self.posts, pd.DataFrame([stored])], ignore_index=True)
            self._posts[post_id] = self.posts.iloc[-1]
            self._content_types[post_id] = "discussion"
            return post_id
