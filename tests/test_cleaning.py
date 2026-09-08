from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from cleaning import (
    MODEL_NAME,
    classify_posts,
    cloud_qdrant_client,
    enrich_post_books,
    make_payload,
    main,
    prepare_posts_dataframe,
)


class CleaningTests(unittest.TestCase):
    def test_skip_qdrant_saves_local_artifacts_without_cloud_credentials(self) -> None:
        posts = pd.DataFrame({"post_id": [1], "content": ["Example post"]})
        embeddings = np.array([[1.0, 0.0]], dtype="float32")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch("cleaning.DATA_DIR", root),
                patch("cleaning.PROCESSED_POSTS_FILE", root / "posts.csv"),
                patch("cleaning.POST_EMBEDDINGS_FILE", root / "embeddings.npy"),
                patch("cleaning.prepare_posts_dataframe", return_value=posts),
                patch("cleaning.enrich_post_books", return_value=posts),
                patch("cleaning.load_embedding_model"),
                patch("cleaning.create_embeddings", return_value=embeddings),
                patch("cleaning.classify_posts", return_value=posts),
                patch("cleaning.cloud_qdrant_client") as cloud_client,
                patch("cleaning.upload_to_qdrant") as upload,
            ):
                main(["--skip-qdrant"])

            cloud_client.assert_not_called()
            upload.assert_not_called()
            self.assertEqual(pd.read_csv(root / "posts.csv")["post_id"].tolist(), [1])
            np.testing.assert_array_equal(np.load(root / "embeddings.npy"), embeddings)

    def test_qdrant_payload_contains_synthetic_identity(self) -> None:
        post = SimpleNamespace(
            post_id=1,
            user_id=20,
            nickname="quiet_owl",
            book_id=10,
            book_title="Sample Book",
            content="A sufficiently detailed synthetic book reaction.",
            content_type="review",
            word_count=7,
            view_count=5,
            like_count=2,
            comment_count=1,
            repost_count=0,
            published_at="2026-01-01T00:00:00Z",
        )
        payload = make_payload(post)
        self.assertEqual(payload["user_id"], 20)
        self.assertEqual(payload["nickname"], "quiet_owl")

    def test_cloud_credentials_are_required_before_processing(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "QDRANT_URL"):
                cloud_qdrant_client()

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
