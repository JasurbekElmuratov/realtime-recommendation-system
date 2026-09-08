"""Book-profile construction, feedback persistence, and lightweight learning."""

from __future__ import annotations

import csv
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Mapping, Sequence

import numpy as np
import pandas as pd


READ_WEIGHT = 1.0
SAVED_WEIGHT = 0.8
BOOK_EVENT_FIELDS = ("timestamp", "user_id", "book_id", "event")
POST_EVENT_FIELDS = (
    "timestamp",
    "user_id",
    "post_id",
    "event",
    "profile_name",
)

def normalize_vector(vector: np.ndarray) -> np.ndarray:
    """Keep a vector's direction and make its length equal to one."""
    value = np.asarray(vector, dtype="float32")
    norm = float(np.linalg.norm(value))
    if not np.isfinite(norm) or norm == 0:
        raise ValueError("A profile vector must have a finite, non-zero norm")
    return (value / norm).astype("float32")


def describe_book(book: object) -> str:
    return (
        f"Title: {book.title}. Author: {book.author}. "
        f"Genre: {book.genre}. Description: {book.description}"
    )


def build_post_book_lookup(
    source_posts: pd.DataFrame,
    books: pd.DataFrame,
) -> dict[int, tuple[int | None, str]]:
    """Map post IDs to book IDs and display titles for UI fallback use."""

    links = source_posts[["post_id", "book_id"]].drop_duplicates("post_id")
    catalog = books[["book_id", "title"]].drop_duplicates("book_id")
    merged = links.merge(catalog, on="book_id", how="left", validate="many_to_one")
    lookup: dict[int, tuple[int | None, str]] = {}
    for row in merged.itertuples(index=False):
        book_id = None if pd.isna(row.book_id) else int(row.book_id)
        title = "Unknown book"
        if not pd.isna(row.title):
            title = str(row.title)
        elif book_id is not None:
            title = f"Book #{book_id}"
        lookup[int(row.post_id)] = (book_id, title)
    return lookup


def resolve_post_book(
    payload: Mapping[str, object],
    lookup: Mapping[int, tuple[int | None, str]],
) -> tuple[int | None, str]:
    """Resolve payload metadata first, then fall back to the local lookup."""

    raw_book_id = payload.get("book_id")
    try:
        book_id = None if raw_book_id is None else int(raw_book_id)
    except (TypeError, ValueError):
        book_id = None
    raw_title = payload.get("book_title")
    if raw_title is not None and str(raw_title).strip():
        return book_id, str(raw_title).strip()

    try:
        post_id = int(payload["post_id"])
    except (KeyError, TypeError, ValueError):
        post_id = -1
    if post_id in lookup:
        return lookup[post_id]
    return book_id, "Unknown book" if book_id is None else f"Book #{book_id}"


def rank_popular_books(
    books: pd.DataFrame,
    posts: pd.DataFrame,
    *,
    limit: int = 30,
) -> pd.DataFrame:
    """Rank catalog books using engagement from book-related posts."""

    if limit < 1:
        raise ValueError("limit must be positive")
    activity = posts.copy()
    if "y" in activity.columns:
        activity = activity[pd.to_numeric(activity["y"], errors="coerce") == 1]

    metrics = ("view_count", "like_count", "comment_count", "repost_count")
    for column in metrics:
        if column not in activity.columns:
            activity[column] = 0
        activity[column] = pd.to_numeric(
            activity[column], errors="coerce"
        ).fillna(0).clip(lower=0)

    activity["popularity_score"] = (
        activity["view_count"]
        + 4 * activity["like_count"]
        + 6 * activity["comment_count"]
        + 8 * activity["repost_count"]
        + 50
    )
    summary = activity.groupby("book_id", as_index=False).agg(
        popularity_score=("popularity_score", "sum"),
        post_count=("post_id", "size"),
        total_views=("view_count", "sum"),
    )
    popular = books.merge(summary, on="book_id", how="inner", validate="one_to_one")
    popular = popular.sort_values(
        ["popularity_score", "post_count", "total_views", "title"],
        ascending=[False, False, False, True],
    )
    return popular.head(limit).reset_index(drop=True)


def build_profile_vector(
    model: object,
    books: pd.DataFrame,
    read_book_ids: Sequence[object],
    saved_book_ids: Sequence[object],
) -> tuple[np.ndarray, list[str]]:
    """Average the chosen book vectors: read weight 1.0, saved weight 0.8."""

    read_ids = [str(value) for value in read_book_ids]
    saved_ids = [str(value) for value in saved_book_ids]
    if not read_ids and not saved_ids:
        raise ValueError("Select at least one read or interested book")
    if set(read_ids) & set(saved_ids):
        raise ValueError("A book cannot be both read and interested")

    indexed = books.copy()
    indexed["_book_id"] = indexed["book_id"].astype(str)
    indexed = indexed.set_index("_book_id", drop=False)
    missing = (set(read_ids) | set(saved_ids)) - set(indexed.index)
    if missing:
        raise ValueError(f"Unknown book IDs: {', '.join(sorted(missing))}")

    selected_ids = read_ids + saved_ids
    selected = [indexed.loc[book_id] for book_id in selected_ids]
    book_descriptions = []
    for book in selected:
        book_descriptions.append(describe_book(book))
    vectors = model.encode(book_descriptions, normalize_embeddings=True)
    vectors = np.asarray(vectors, dtype="float32")
    weights = np.asarray(
        [READ_WEIGHT] * len(read_ids) + [SAVED_WEIGHT] * len(saved_ids),
        dtype="float32",
    )
    profile = normalize_vector(np.average(vectors, axis=0, weights=weights))

    exact_terms: set[str] = set()
    for book in selected:
        exact_terms.add(str(book.title).lower())
        exact_terms.add(str(book.author).lower())
        for genre in str(book.genre).split("|"):
            genre = genre.strip().lower()
            if genre:
                exact_terms.add(genre)
    return profile, sorted(exact_terms)


def learn_preference_vector(
    base_vector: np.ndarray,
    feedback_vectors: np.ndarray,
    labels: Sequence[int | bool],
    *,
    training_steps: int = 120,
) -> tuple[np.ndarray, str]:
    """Move the profile toward liked posts and away from disliked posts.

    Mixed feedback trains one small vector; the sentence model stays unchanged.
    With only likes or only dislikes, use a simple average-based update instead.
    """

    base = normalize_vector(base_vector)
    vectors = np.asarray(feedback_vectors, dtype="float32")
    targets = np.asarray(labels, dtype="float32")
    if vectors.ndim != 2 or vectors.shape[1] != base.shape[0]:
        raise ValueError("Feedback vectors must match the profile dimension")
    if len(vectors) != len(targets) or len(vectors) == 0:
        raise ValueError("Every feedback vector must have one label")
    if not set(np.unique(targets)).issubset({0.0, 1.0}):
        raise ValueError("Feedback labels must be zero or one")
    if training_steps < 1:
        raise ValueError("training_steps must be positive")

    vectors = np.vstack([normalize_vector(vector) for vector in vectors])
    if len(np.unique(targets)) < 2:
        direction = vectors.mean(axis=0)
        if targets[0] == 0:
            direction = -direction
        return normalize_vector(0.75 * base + 0.25 * direction), "centroid_update"

    # Only feedback training needs PyTorch. Browsing books does not load it.
    import torch
    from torch import nn
    from torch.nn import functional as F

    torch.manual_seed(7)
    post_vectors = torch.tensor(vectors, dtype=torch.float32)
    liked_labels = torch.tensor(targets, dtype=torch.float32)
    initial = torch.tensor(base, dtype=torch.float32)
    preference = nn.Parameter(initial.clone())
    bias = nn.Parameter(torch.zeros(1, dtype=torch.float32))
    optimizer = torch.optim.Adam((preference, bias), lr=0.03)

    for _ in range(training_steps):
        optimizer.zero_grad()
        unit_preference = F.normalize(preference, dim=0)
        # Dot products measure similarity to the current preference direction.
        logits = 6.0 * (post_vectors @ unit_preference) + bias
        prediction_loss = F.binary_cross_entropy_with_logits(logits, liked_labels)
        # Keep a small round of feedback from erasing the original interests.
        stability_loss = 0.20 * torch.sum((unit_preference - initial) ** 2)
        (prediction_loss + stability_loss).backward()
        optimizer.step()

    learned = F.normalize(preference.detach(), dim=0).cpu().numpy()
    return normalize_vector(0.40 * base + 0.60 * learned), "neural_head"


def _append_rows(
    path: str | Path,
    fieldnames: Sequence[str],
    rows: Iterable[dict[str, object]],
) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    needs_header = not destination.exists() or destination.stat().st_size == 0
    with destination.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        if needs_header:
            writer.writeheader()
        writer.writerows(rows)


def log_book_events(
    path: str | Path,
    user_id: int,
    read_book_ids: Sequence[object],
    saved_book_ids: Sequence[object],
) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    rows = []
    for event, book_ids in [("read", read_book_ids), ("saved", saved_book_ids)]:
        for book_id in book_ids:
            rows.append({
                "timestamp": timestamp,
                "user_id": user_id,
                "book_id": book_id,
                "event": event,
            })
    _append_rows(path, BOOK_EVENT_FIELDS, rows)


def log_post_feedback(
    path: str | Path,
    user_id: int,
    feedback: dict[int, bool],
    profile_name: str,
) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    rows = []
    for post_id, liked in feedback.items():
        rows.append({
            "timestamp": timestamp,
            "user_id": user_id,
            "post_id": post_id,
            "event": "liked" if liked else "disliked",
            "profile_name": profile_name,
        })
    _append_rows(path, POST_EVENT_FIELDS, rows)
