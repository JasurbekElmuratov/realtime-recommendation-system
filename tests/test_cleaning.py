from pathlib import Path
import tempfile
import unittest

import numpy as np
import pandas as pd

from cleaning import MODEL_NAME, classify_posts, enrich_post_books, prepare_posts_dataframe


class CleaningTests(unittest.TestCase):
    def test_trained_classification_fields_are_added(self) -> None:
        class FakeClassifier:
            embedding_model = MODEL_NAME

            def predict(self, texts, embeddings):
                self.seen_texts = texts
                self.seen_embeddings = embeddings
                return (
                    np.asarray(["review", "discussion"]),
                    np.asarray([0.8, 0.7]),
                    np.asarray([0.5, 0.3]),
                    np.zeros((2, 3)),
                )

        posts = pd.DataFrame({"content": ["A layered ending.", "Why did it end there?"]})
        embeddings = np.zeros((2, 384), dtype="float32")
        classified = classify_posts(posts, embeddings, FakeClassifier())
        self.assertEqual(classified["content_type"].tolist(), ["review", "discussion"])
        self.assertEqual(classified["classification_score"].tolist(), [0.8, 0.7])

    def test_classification_requires_one_embedding_per_post(self) -> None:
        posts = pd.DataFrame({"content": ["A layered ending."]})
        with self.assertRaisesRegex(ValueError, "one embedding"):
            classify_posts(posts, np.zeros((0, 384), dtype="float32"))

    def test_post_filtering_and_book_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            posts_path, books_path = root / "posts.csv", root / "books.csv"
            pd.DataFrame([
                {"post_id": 1, "book_id": 10, "content": "The author creates a compelling plot with memorable characters and surprising themes.", "published_at": "2026-01-01T00:00:00Z", "view_count": 1, "like_count": 1, "comment_count": 0, "repost_count": 0},
                {"post_id": 2, "book_id": 10, "content": "Great book", "published_at": "2026-01-01T00:00:00Z", "view_count": 1, "like_count": 1, "comment_count": 0, "repost_count": 0},
            ]).to_csv(posts_path, index=False)
            pd.DataFrame({"book_id": [10], "title": ["Sample Book"]}).to_csv(books_path, index=False)
            prepared = prepare_posts_dataframe(posts_path)
            enriched = enrich_post_books(prepared, books_path=books_path)
        self.assertEqual(enriched["post_id"].tolist(), [1])
        self.assertEqual(enriched["book_title"].tolist(), ["Sample Book"])

    def test_off_topic_rows_are_removed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            posts_path = Path(directory) / "posts.csv"
            common = {
                "book_id": 10,
                "published_at": "2026-01-01T00:00:00Z",
                "view_count": 1,
                "like_count": 0,
                "comment_count": 0,
                "repost_count": 0,
            }
            pd.DataFrame([
                {**common, "post_id": 1, "content": "The author creates a thoughtful story with layered characters and themes.", "is_book_related": 1},
                {**common, "post_id": 2, "content": "Random traffic update from downtown that has nothing to do with reading.", "is_book_related": 0},
            ]).to_csv(posts_path, index=False)
            prepared = prepare_posts_dataframe(posts_path)
        self.assertEqual(prepared["post_id"].tolist(), [1])
