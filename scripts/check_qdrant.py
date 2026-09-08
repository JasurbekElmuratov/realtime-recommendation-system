"""Verify that BookFeed can reach its Qdrant Cloud posts collection."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from qdrant_client import QdrantClient


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from generate_recommendations import COLLECTION_NAME  # noqa: E402


def main() -> None:
    url = os.getenv("QDRANT_URL")
    api_key = os.getenv("QDRANT_API_KEY")
    if not url or not api_key:
        raise SystemExit("Set QDRANT_URL and QDRANT_API_KEY before running this check.")
    try:
        collection = QdrantClient(url=url, api_key=api_key).get_collection(COLLECTION_NAME)
    except Exception as exc:
        raise SystemExit(f"Qdrant Cloud check failed: {exc}") from exc
    print(json.dumps({
        "connected": True,
        "collection": COLLECTION_NAME,
        "points_count": getattr(collection, "points_count", None),
        "vectors_count": getattr(collection, "vectors_count", None),
    }, indent=2))


if __name__ == "__main__":
    main()
