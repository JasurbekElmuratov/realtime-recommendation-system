"""Clean, classify, embed, and optionally index English book posts."""

import argparse
import os
import re
from pathlib import Path

import numpy as np
import pandas as pd
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from sentence_transformers import SentenceTransformer

from content_classifier import LinearContentClassifier, load_content_classifier
from relevance import MODEL_NAME, load_model

COLLECTION_NAME = "posts"
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
POSTS_FILE = DATA_DIR / "posts.csv"
BOOKS_FILE = DATA_DIR / "books.csv"
PROCESSED_POSTS_FILE = DATA_DIR / "posts_processed.csv"
POST_EMBEDDINGS_FILE = DATA_DIR / "post_embeddings.npy"
MIN_WORDS, MIN_UNIQUE_WORDS, MAX_GENERIC_RATIO = 8, 6, 0.65

GENERIC_WORDS = {"book", "great", "good", "amazing", "interesting", "love", "read"}


def get_words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", str(text).lower())


def prepare_posts_dataframe(posts_path: str | Path = POSTS_FILE) -> pd.DataFrame:
    posts = pd.read_csv(posts_path)
    required = {"post_id", "book_id", "content", "view_count", "like_count", "comment_count", "repost_count", "published_at"}
    missing = required - set(posts.columns)
    if missing:
        raise ValueError(f"Posts file is missing columns: {', '.join(sorted(missing))}")
    if "is_book_related" in posts.columns:
        related = pd.to_numeric(posts["is_book_related"], errors="coerce").fillna(0)
        posts = posts[related == 1].copy()
    posts["content"] = posts["content"].fillna("").str.strip()
    tokens = posts["content"].apply(get_words)
    posts["word_count"] = tokens.apply(len)
    unique_words = tokens.apply(lambda words: len(set(words)))
    generic_ratio = tokens.apply(lambda words: sum(word in GENERIC_WORDS for word in words) / max(len(words), 1))
    posts = posts[(posts["content"] != "") & (posts["word_count"] >= MIN_WORDS) & (unique_words >= MIN_UNIQUE_WORDS) & (generic_ratio < MAX_GENERIC_RATIO)].copy()
    posts["text_key"] = posts["content"].str.lower().str.split().str.join(" ")
    return posts.drop_duplicates("post_id").drop_duplicates("text_key").drop(columns=["text_key"]).reset_index(drop=True)


def create_embeddings(texts: list[str] | pd.Series, model: SentenceTransformer) -> np.ndarray:
    return model.encode(texts, batch_size=32, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=True).astype("float32")


def classify_posts(
    posts: pd.DataFrame,
    embeddings: np.ndarray,
    classifier: LinearContentClassifier | None = None,
) -> pd.DataFrame:
    """Classify posts as reviews, recommendations, or discussions."""
    if len(posts) != len(embeddings):
        raise ValueError("Every post must have one embedding before classification")
    classifier = classifier or load_content_classifier()
    if classifier.embedding_model != MODEL_NAME:
        raise ValueError(
            "Content classifier and cleaning pipeline use different embedding models"
        )
    labels, confidence, margin, _ = classifier.predict(
        posts["content"].fillna("").astype(str).tolist(), embeddings
    )
    classified = posts.copy()
    classified["content_type"] = labels
    classified["classification_score"] = np.round(confidence, 6)
    classified["classification_margin"] = np.round(margin, 6)
    return classified


def enrich_post_books(posts: pd.DataFrame, *, books_path: str | Path = BOOKS_FILE) -> pd.DataFrame:
    enriched = posts.copy()
    if "book_title" in enriched.columns:
        enriched = enriched.drop(columns="book_title")
    enriched["book_id"] = pd.to_numeric(enriched["book_id"], errors="coerce").astype("Int64")
    books = pd.read_csv(books_path, usecols=["book_id", "title"])
    books["book_id"] = pd.to_numeric(books["book_id"], errors="coerce").astype("Int64")
    books = books.drop_duplicates("book_id").rename(columns={"title": "book_title"})
    merged = enriched.merge(books, on="book_id", how="left", validate="many_to_one")
    merged["book_title"] = merged["book_title"].fillna("Unknown book")
    return merged


def make_payload(post: object) -> dict[str, object]:
    return {"post_id": int(post.post_id), "book_id": int(post.book_id), "book_title": str(post.book_title), "content": post.content, "content_type": post.content_type, "word_count": int(post.word_count), "view_count": int(post.view_count), "like_count": int(post.like_count), "comment_count": int(post.comment_count), "repost_count": int(post.repost_count), "published_at": post.published_at}


def upload_to_qdrant(posts: pd.DataFrame, embeddings: np.ndarray) -> None:
    if len(posts) != len(embeddings):
        raise ValueError("Every processed post must have one embedding")
    client = QdrantClient(url=os.environ["QDRANT_URL"], api_key=os.environ["QDRANT_API_KEY"])
    client.recreate_collection(collection_name=COLLECTION_NAME, vectors_config=VectorParams(size=embeddings.shape[1], distance=Distance.COSINE))
    for start in range(0, len(posts), 100):
        batch = posts.iloc[start : start + 100]
        points = [PointStruct(id=int(post.post_id), vector=embeddings[start + offset].tolist(), payload=make_payload(post)) for offset, post in enumerate(batch.itertuples(index=False))]
        client.upsert(collection_name=COLLECTION_NAME, points=points)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Clean, embed, classify, and index English book posts.")
    parser.add_argument("--skip-qdrant", action="store_true", help="Build local files without uploading to Qdrant")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    posts = enrich_post_books(prepare_posts_dataframe())
    embeddings = create_embeddings(posts["content"].tolist(), load_model())
    posts = classify_posts(posts, embeddings)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    posts.to_csv(PROCESSED_POSTS_FILE, index=False)
    np.save(POST_EMBEDDINGS_FILE, embeddings)
    if not args.skip_qdrant:
        upload_to_qdrant(posts, embeddings)
    print(f"Processed posts: {len(posts)}")
    print(f"Embedding shape: {embeddings.shape}")


if __name__ == "__main__":
    main()
