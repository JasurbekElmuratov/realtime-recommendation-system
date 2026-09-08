"""Paths and environment settings used when the API starts."""

import os
from dataclasses import dataclass, field
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def allowed_origins() -> tuple[str, ...]:
    value = os.getenv(
        "BOOKFEED_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    origins = []
    for origin in value.split(","):
        if origin.strip():
            origins.append(origin.strip())
    return tuple(origins)


@dataclass(frozen=True)
class Settings:
    """A dataclass holds settings; tests can supply temporary file paths."""

    books_path: Path = PROJECT_ROOT / "data" / "books.csv"
    posts_path: Path = PROJECT_ROOT / "data" / "posts.csv"
    processed_posts_path: Path = PROJECT_ROOT / "data" / "posts_processed.csv"
    embeddings_path: Path = PROJECT_ROOT / "data" / "post_embeddings.npy"
    users_path: Path = PROJECT_ROOT / "data" / "users.csv"
    interactions_path: Path = PROJECT_ROOT / "data" / "interactions.csv"
    covers_path: Path = PROJECT_ROOT / "frontend" / "public" / "book-covers"
    cors_origins: tuple[str, ...] = field(default_factory=allowed_origins)
    qdrant_url: str | None = field(default_factory=lambda: os.getenv("QDRANT_URL"))
    qdrant_api_key: str | None = field(default_factory=lambda: os.getenv("QDRANT_API_KEY"))
    disable_embeddings: bool = False  # Tests can run without loading MiniLM.
