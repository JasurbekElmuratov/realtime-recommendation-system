from __future__ import annotations

import csv
from pathlib import Path
import tempfile
import unittest

import numpy as np
import pandas as pd

from personalization import (
    build_post_book_lookup,
    build_profile_vector,
    learn_preference_vector,
    log_book_events,
    log_post_feedback,
    rank_popular_books,
    resolve_post_book,
)


class FakeModel:
    def encode(self, texts, normalize_embeddings=True):
        vectors = np.eye(len(texts), 4, dtype="float32")
        return vectors


class PersonalizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.books = pd.DataFrame(
            {
                "book_id": [1, 2, 3],
                "title": ["Alpha", "Beta", "Gamma"],
                "author": ["Author A", "Author B", "Author C"],
                "genre": ["History | Society", "Science", "Fantasy"],
                "description": ["First", "Second", "Third"],
            }
        )

    def test_book_selections_build_normalized_profile_and_terms(self) -> None:
        profile, terms = build_profile_vector(FakeModel(), self.books, [1], [2])
        self.assertAlmostEqual(float(np.linalg.norm(profile)), 1.0, places=5)
        self.assertIn("alpha", terms)
        self.assertIn("author b", terms)
        self.assertIn("history", terms)

    def test_same_book_cannot_be_read_and_saved(self) -> None:
        with self.assertRaises(ValueError):
            build_profile_vector(FakeModel(), self.books, [1], [1])

    def test_post_book_resolution_prefers_payload_then_local_lookup(self) -> None:
        source_posts = pd.DataFrame(
            {"post_id": [10, 11], "book_id": [1, 99]}
        )
        lookup = build_post_book_lookup(source_posts, self.books)
        self.assertEqual(resolve_post_book({"post_id": 10}, lookup), (1, "Alpha"))
        self.assertEqual(resolve_post_book({"post_id": 11}, lookup), (99, "Book #99"))
        self.assertEqual(
            resolve_post_book(
                {"post_id": 10, "book_id": 1, "book_title": "Payload Title"},
                lookup,
            ),
            (1, "Payload Title"),
        )

    def test_popular_books_use_only_book_related_engagement(self) -> None:
        books = pd.DataFrame(
            {
                "book_id": [1, 2, 3, 4],
                "title": ["One", "Two", "Three", "Four"],
            }
        )
        posts = pd.DataFrame(
            {
                "post_id": [10, 11, 12, 13],
                "book_id": [1, 2, 3, 3],
                "y": [1, 0, 1, 1],
                "view_count": [1000, 10000, 100, 100],
                "like_count": [0, 0, 100, 100],
                "comment_count": [0, 0, 0, 0],
                "repost_count": [0, 0, 0, 0],
            }
        )
        popular = rank_popular_books(books, posts, limit=2)
        self.assertEqual(popular["book_id"].tolist(), [3, 1])
        self.assertNotIn(2, popular["book_id"].tolist())

    def test_popular_book_limit_must_be_positive(self) -> None:
        with self.assertRaises(ValueError):
            rank_popular_books(self.books, pd.DataFrame(), limit=0)

    def test_balanced_feedback_trains_neural_preference_head(self) -> None:
        base = np.array([1.0, 0.0], dtype="float32")
        vectors = np.array(
            [[0.0, 1.0], [0.0, -1.0], [0.1, 0.99], [0.1, -0.99]],
            dtype="float32",
        )
        updated, method = learn_preference_vector(
            base,
            vectors,
            [1, 0, 1, 0],
            training_steps=80,
        )
        self.assertEqual(method, "neural_head")
        self.assertAlmostEqual(float(np.linalg.norm(updated)), 1.0, places=5)
        self.assertGreater(float(updated @ vectors[0]), float(updated @ vectors[1]))

    def test_single_class_feedback_uses_stable_centroid_update(self) -> None:
        base = np.array([1.0, 0.0], dtype="float32")
        vectors = np.array([[0.0, 1.0], [0.1, 0.9]], dtype="float32")
        updated, method = learn_preference_vector(base, vectors, [1, 1])
        self.assertEqual(method, "centroid_update")
        self.assertAlmostEqual(float(np.linalg.norm(updated)), 1.0, places=5)
        self.assertGreater(updated[1], 0.0)

    def test_events_are_appended_with_expected_schema(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            book_path = Path(directory) / "books.csv"
            post_path = Path(directory) / "posts.csv"
            log_book_events(book_path, 7, [1, 2], [3])
            log_post_feedback(post_path, 7, {10: True, 11: False}, "round_1")
            with book_path.open(encoding="utf-8", newline="") as handle:
                book_rows = list(csv.DictReader(handle))
            with post_path.open(encoding="utf-8", newline="") as handle:
                post_rows = list(csv.DictReader(handle))
            self.assertEqual([row["event"] for row in book_rows], ["read", "read", "saved"])
            self.assertEqual([row["event"] for row in post_rows], ["liked", "disliked"])


if __name__ == "__main__":
    unittest.main()
