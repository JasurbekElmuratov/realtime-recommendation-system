"""Predict whether each post is relevant to its assigned book.

The predictor compares the meaning of a post with the description of the book
identified by ``book_id``. Existing ``is_book_related`` values are never used
to make predictions; when present, they are used only to report evaluation
metrics for the synthetic dataset.
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer


MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_THRESHOLD = 0.34
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
POSTS_FILE = DATA_DIR / "posts.csv"
BOOKS_FILE = DATA_DIR / "books.csv"
OUTPUT_FILE = DATA_DIR / "posts_with_relevance.csv"


def load_model() -> SentenceTransformer:
    """Use the local model cache when available, otherwise download once."""
    try:
        return SentenceTransformer(MODEL_NAME, local_files_only=True)
    except OSError:
        return SentenceTransformer(MODEL_NAME)


def validate_inputs(posts: pd.DataFrame, books: pd.DataFrame) -> None:
    """Check that the two input tables contain the fields the model needs."""
    missing_posts = {"post_id", "book_id", "content"} - set(posts.columns)
    missing_books = {"book_id", "description"} - set(books.columns)
    if missing_posts:
        raise ValueError(f"Posts file is missing columns: {', '.join(sorted(missing_posts))}")
    if missing_books:
        raise ValueError(f"Books file is missing columns: {', '.join(sorted(missing_books))}")
    if books["book_id"].duplicated().any():
        raise ValueError("Every book_id in the books file must be unique")


def cosine_scores(post_vectors: np.ndarray, book_vectors: np.ndarray) -> np.ndarray:
    """Return row-by-row cosine similarity for already normalized vectors."""
    if post_vectors.shape != book_vectors.shape:
        raise ValueError("Post and matched-book vectors must have the same shape")
    return np.sum(post_vectors * book_vectors, axis=1)


def predict_relevance(
    posts: pd.DataFrame,
    books: pd.DataFrame,
    model: SentenceTransformer,
    *,
    threshold: float = DEFAULT_THRESHOLD,
) -> pd.DataFrame:
    """Add a semantic relevance score and binary prediction to every post."""
    validate_inputs(posts, books)
    if not -1.0 <= threshold <= 1.0:
        raise ValueError("Threshold must be between -1 and 1")

    book_rows = books[["book_id", "description"]].copy()
    book_rows["description"] = book_rows["description"].fillna("").astype(str)
    book_vectors = model.encode(
        book_rows["description"].tolist(),
        batch_size=64,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=True,
    ).astype("float32")
    vector_by_book_id = dict(zip(book_rows["book_id"], book_vectors, strict=True))

    unknown_ids = sorted(set(posts["book_id"]) - set(vector_by_book_id))
    if unknown_ids:
        preview = ", ".join(map(str, unknown_ids[:10]))
        raise ValueError(f"Posts reference unknown book_id values: {preview}")

    post_vectors = model.encode(
        posts["content"].fillna("").astype(str).tolist(),
        batch_size=64,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=True,
    ).astype("float32")
    matched_book_vectors = np.stack([vector_by_book_id[book_id] for book_id in posts["book_id"]])
    scores = cosine_scores(post_vectors, matched_book_vectors)

    result = posts.copy()
    result["relevance_score"] = np.round(scores, 6)
    result["predicted_is_book_related"] = (scores >= threshold).astype("int8")
    return result


def evaluation_metrics(result: pd.DataFrame) -> dict[str, float | int] | None:
    """Evaluate predictions when known labels are available."""
    if "is_book_related" not in result.columns:
        return None
    expected = pd.to_numeric(result["is_book_related"], errors="coerce")
    valid = expected.isin([0, 1])
    if not valid.any():
        return None
    actual = expected[valid].astype(int).to_numpy()
    predicted = result.loc[valid, "predicted_is_book_related"].astype(int).to_numpy()
    tp = int(np.sum((actual == 1) & (predicted == 1)))
    tn = int(np.sum((actual == 0) & (predicted == 0)))
    fp = int(np.sum((actual == 0) & (predicted == 1)))
    fn = int(np.sum((actual == 1) & (predicted == 0)))
    return {
        "evaluated": int(len(actual)),
        "correct": tp + tn,
        "accuracy": (tp + tn) / len(actual),
        "precision": tp / max(tp + fp, 1),
        "recall": tp / max(tp + fn, 1),
        "true_positive": tp,
        "true_negative": tn,
        "false_positive": fp,
        "false_negative": fn,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Predict whether posts are semantically relevant to their assigned books."
    )
    parser.add_argument("--posts", type=Path, default=POSTS_FILE, help="Input posts CSV")
    parser.add_argument("--books", type=Path, default=BOOKS_FILE, help="Input books CSV")
    parser.add_argument("--output", type=Path, default=OUTPUT_FILE, help="Output CSV")
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f"Minimum cosine similarity for relevance (default: {DEFAULT_THRESHOLD})",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    posts = pd.read_csv(args.posts)
    books = pd.read_csv(args.books)
    model = load_model()
    result = predict_relevance(posts, books, model, threshold=args.threshold)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(args.output, index=False)

    print(f"Scored posts: {len(result)}")
    print(f"Predicted relevant: {int(result['predicted_is_book_related'].sum())}")
    print(f"Predicted off-topic: {int((result['predicted_is_book_related'] == 0).sum())}")
    print(f"Output: {args.output}")
    metrics = evaluation_metrics(result)
    if metrics:
        print(f"Accuracy against known synthetic labels: {metrics['accuracy']:.2%}")
        print(
            "Confusion matrix: "
            f"TP={metrics['true_positive']}, TN={metrics['true_negative']}, "
            f"FP={metrics['false_positive']}, FN={metrics['false_negative']}"
        )


if __name__ == "__main__":
    main()
