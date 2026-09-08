"""Find similar posts, score them, and fill a personalized book feed.

Search order: user's interests -> closest genres -> neighboring genres -> books
in general. The command at the bottom also saves a seven-post example feed.
"""

import math
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

from embedding_model import MODEL_NAME, load_embedding_model
from genre_taxonomy import GENRES, GENERAL_BOOK_PROFILE, GENERAL_BOOK_TERMS


COLLECTION_NAME = "posts"
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
BOOKS_FILE = DATA_DIR / "books.csv"
ACTIVITY_FILE = DATA_DIR / "user_events.csv"
INTERACTIONS_FILE = DATA_DIR / "interaction_events.csv"
RESULTS_FILE = DATA_DIR / "recommendations.csv"
PROFILE_NAME = "metadata_profile"

USER_ID = 1
FEED_SIZE = 7
DIRECT_SIMILARITY = 0.45
GENRE_SIMILARITY = {1: 0.40, 2: 0.34, 3: 0.28}
EXCLUDE_ALREADY_SEEN = False


def book_description(book: object) -> str:
    return (
        f"Title: {book.title}. Author: {book.author}. "
        f"Genre: {book.genre}. Description: {book.description}"
    )


def build_user_profile(user_id: int) -> tuple[list[str], list[str]]:
    books = pd.read_csv(BOOKS_FILE)
    books["book_id"] = books["book_id"].astype(str)
    books = books.set_index("book_id")

    events = pd.read_csv(ACTIVITY_FILE)
    events = events[events["user_id"] == user_id].sort_values(
        "timestamp", ascending=False
    )

    profile_texts = []
    exact_terms = set()
    genre_counts = Counter()
    for event in ("read", "saved", "searched"):
        book_ids = (
            events[events["event"] == event]["book_id"]
            .drop_duplicates()
            .head(20)
        )
        selected_books = [books.loc[str(book_id)] for book_id in book_ids]

        for book in selected_books:
            profile_texts.append(book_description(book))
            exact_terms.update({book.title.lower(), book.author.lower()})
            book_genres = [genre.strip() for genre in book.genre.split("|")]
            genre_counts.update(book_genres)
            exact_terms.update(genre.lower() for genre in book_genres)

    if not profile_texts:
        raise ValueError(f"No synthetic activity found for user {user_id}")

    genre_summary = ", ".join(genre for genre, _ in genre_counts.most_common())
    profile_texts.insert(0, "Main interests: " + genre_summary)
    return profile_texts, sorted(exact_terms)


def get_blocked_posts(user_id: int) -> set[str]:
    if not INTERACTIONS_FILE.exists():
        return set()

    events = pd.read_csv(INTERACTIONS_FILE)
    blocked_events = {"not_interested", "disliked", "skipped"}
    if EXCLUDE_ALREADY_SEEN:
        blocked_events.add("shown")

    blocked = events[
        (events["user_id"] == user_id) & events["event"].isin(blocked_events)
    ]
    return set(blocked["post_id"].astype(str))


def log_interaction(user_id: int, post_id: int, event: str) -> None:
    row = pd.DataFrame(
        [
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "user_id": user_id,
                "post_id": post_id,
                "event": event,
                "profile_name": PROFILE_NAME,
            }
        ]
    )
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    row.to_csv(
        INTERACTIONS_FILE,
        mode="a",
        header=not INTERACTIONS_FILE.exists(),
        index=False,
    )


def freshness_score(value: object) -> float:
    published_at = pd.to_datetime(value, errors="coerce", utc=True)
    if pd.isna(published_at):
        return 0.5

    age_hours = max(
        (
            datetime.now(timezone.utc) - published_at.to_pydatetime()
        ).total_seconds()
        / 3600,
        0,
    )
    return 1 / (1 + age_hours / 168)


def exact_match_score(payload: dict[str, object], terms: list[str]) -> float:
    text = str(payload["content"]).lower()
    matches = 0
    for term in terms:
        # Match complete words or phrases, so "art" does not match "start".
        pattern = rf"(?<!\w){re.escape(term)}(?!\w)"
        if re.search(pattern, text):
            matches += 1
    return min(matches / 2, 1.0)


def rank_results(
    results: list[object],
    exact_terms: list[str],
    blocked_posts: set[str],
):
    """Calculate the same weighted score for every allowed search result."""
    allowed_results = []
    max_log_views = 1.0
    for result in results:
        post = result.payload
        if str(post["post_id"]) in blocked_posts:
            continue
        if post["content_type"] not in {"review", "recommendation", "discussion"}:
            continue
        allowed_results.append(result)
        max_log_views = max(max_log_views, math.log1p(post["view_count"]))
    ranked = []

    for result in allowed_results:
        post = result.payload
        views = post["view_count"]
        features = {
            "similarity": max(0.0, min(float(result.score), 1.0)),
            "exact_match": exact_match_score(post, exact_terms),
            "freshness": freshness_score(post["published_at"]),
            "like_rate": min(post["like_count"] / max(views, 1), 1.0),
            "comment_rate": min(post["comment_count"] / max(views, 1), 1.0),
            "views": math.log1p(views) / max_log_views,
            "length": min(post["word_count"] / 100, 1.0),
        }
        score = (
            0.60 * features["similarity"]
            + 0.12 * features["exact_match"]
            + 0.10 * features["freshness"]
            + 0.08 * features["like_rate"]
            + 0.03 * features["comment_rate"]
            + 0.03 * features["views"]
            + 0.04 * features["length"]
        )
        ranked.append({"result": result, "score": score, "features": features})

    return sorted(ranked, key=lambda item: item["score"], reverse=True)


def search(
    client: QdrantClient,
    vector: list[float] | np.ndarray,
    terms: list[str],
    blocked_posts: set[str],
    topic: str,
    level: int,
    threshold: float | None,
    limit: int = 100,
):
    options = {
        "collection_name": COLLECTION_NAME,
        "query": vector,
        "limit": limit,
        "with_payload": True,
    }
    if threshold is not None:
        options["score_threshold"] = threshold

    results = client.query_points(**options).points
    ranked = rank_results(
        results,
        terms,
        blocked_posts,
    )
    for item in ranked:
        item["topic"] = topic
        item["level"] = level
    return ranked


def merge_candidates(current: list[dict], new: list[dict]) -> list[dict]:
    """Keep each post once, preferring a closer topic and then a higher score."""
    best = {}
    for item in current + new:
        post_id = str(item["result"].payload["post_id"])
        old = best.get(post_id)
        if old is None:
            best[post_id] = item
        elif item["level"] < old["level"]:
            best[post_id] = item
        elif item["level"] == old["level"] and item["score"] > old["score"]:
            best[post_id] = item
    return list(best.values())


def build_feed(candidates: list[dict], feed_size: int = FEED_SIZE) -> list[dict]:
    """Order by topic distance, post type, length, and finally weighted score."""
    content_type_order = {"review": 0, "discussion": 1, "recommendation": 2}

    def feed_order(item):
        post = item["result"].payload
        # Smaller values come first. Negatives put larger lengths/scores first.
        return (
            item["level"],
            content_type_order.get(post["content_type"], 3),
            -int(post["word_count"]),
            -item["score"],
        )

    candidates = sorted(candidates, key=feed_order)
    return candidates[:feed_size]


def genre_vectors(model: SentenceTransformer) -> dict[str, np.ndarray]:
    names = list(GENRES)
    vectors = model.encode(
        [GENRES[name]["profile"] for name in names],
        normalize_embeddings=True,
    )
    return dict(zip(names, vectors))


def genre_search_plan(
    user_vector: np.ndarray,
    vectors: dict[str, np.ndarray],
) -> list[tuple[int, str]]:
    """Start from two closest genres, then explore their neighbors twice."""
    scored = []
    for name, vector in vectors.items():
        similarity = float(np.dot(user_vector, vector))
        scored.append((name, similarity))
    scored.sort(key=lambda item: item[1], reverse=True)
    primary = [name for name, _ in scored[:2]]
    plan = [(1, name) for name in primary]
    seen = set(primary)
    frontier = primary

    for level in (2, 3):
        next_frontier = []
        for name in frontier:
            for neighbor in GENRES[name]["neighbors"]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    next_frontier.append(neighbor)
                    plan.append((level, neighbor))
        frontier = next_frontier
    return plan


def recommend_for_profile(
    client: QdrantClient,
    model: SentenceTransformer,
    user_vector: np.ndarray,
    exact_terms: list[str],
    blocked_posts: set[str],
    feed_size: int = FEED_SIZE,
) -> list[dict]:
    """Search increasingly broad topics until enough posts are available."""

    # 1. First search with the user's own book profile.
    candidates = search(
        client,
        user_vector.tolist(),
        exact_terms,
        blocked_posts,
        "direct_interest",
        0,
        DIRECT_SIMILARITY,
    )
    feed = build_feed(candidates, feed_size)

    if len(feed) < feed_size:
        # 2. Expand through the genre map only when the first search is short.
        vectors = genre_vectors(model)
        plan = genre_search_plan(user_vector, vectors)
        for level in (1, 2, 3):
            for genre_level, name in plan:
                if genre_level != level:
                    continue
                found = search(
                    client,
                    vectors[name].tolist(),
                    GENRES[name]["terms"],
                    blocked_posts,
                    name,
                    level,
                    GENRE_SIMILARITY[level],
                )
                candidates = merge_candidates(candidates, found)
            feed = build_feed(candidates, feed_size)
            if len(feed) == feed_size:
                break

    if len(feed) < feed_size:
        # 3. Last resort: search all book topics without a similarity minimum.
        general_vector = model.encode(
            GENERAL_BOOK_PROFILE,
            normalize_embeddings=True,
        )
        found = search(
            client,
            general_vector.tolist(),
            GENERAL_BOOK_TERMS,
            blocked_posts,
            "general_books",
            4,
            None,
            limit=500,
        )
        candidates = merge_candidates(candidates, found)
        feed = build_feed(candidates, feed_size)

    return feed


def save_and_print(feed: list[dict]) -> None:
    rows = []
    for rank, item in enumerate(feed, 1):
        post = item["result"].payload
        rows.append(
            {
                "profile_name": PROFILE_NAME,
                "user_id": USER_ID,
                "rank": rank,
                "post_id": post["post_id"],
                "book_id": post.get("book_id"),
                "book_title": post.get("book_title", "Unknown book"),
                "content_type": post["content_type"],
                "source_topic": item["topic"],
                "topic_level": item["level"],
                "semantic_score": float(item["result"].score),
                "final_score": item["score"],
                "content": post["content"],
            }
        )

        print(
            f"{rank}. {post['content_type']} | score: {item['score']:.4f} | "
            f"semantic score: {item['result'].score:.4f}"
        )
        print(post["content"])
        print()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(RESULTS_FILE, index=False)


def main() -> None:
    profile_texts, exact_terms = build_user_profile(USER_ID)
    model = load_embedding_model()
    book_vectors = model.encode(profile_texts, normalize_embeddings=True)
    user_vector = book_vectors.mean(axis=0)
    user_vector = user_vector / np.linalg.norm(user_vector)

    client = QdrantClient(
        url=os.environ["QDRANT_URL"],
        api_key=os.environ["QDRANT_API_KEY"],
    )
    blocked_posts = get_blocked_posts(USER_ID)

    feed = recommend_for_profile(
        client,
        model,
        user_vector,
        exact_terms,
        blocked_posts,
        feed_size=FEED_SIZE,
    )

    save_and_print(feed)
    for item in feed:
        log_interaction(
            USER_ID,
            item["result"].payload["post_id"],
            "shown",
        )
    print(f"Saved {len(feed)} recommendations to {RESULTS_FILE}")


if __name__ == "__main__":
    main()
