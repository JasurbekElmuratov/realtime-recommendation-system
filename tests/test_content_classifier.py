from pathlib import Path
import tempfile
import unittest

import numpy as np
import pandas as pd

from content_classifier import (
    TEXT_FEATURE_NAMES,
    LinearContentClassifier,
    extract_text_features,
    load_content_classifier,
)
from train_content_classifier import grouped_split_labels


class ContentClassifierTests(unittest.TestCase):
    def test_linear_softmax_predictions(self) -> None:
        classifier = LinearContentClassifier(
            weights=np.asarray(
                [[2.0, 0.0], [0.0, 2.0], [-1.0, -1.0]], dtype="float32"
            ),
            bias=np.zeros(3, dtype="float32"),
            classes=np.asarray(["discussion", "recommendation", "review"]),
            embedding_model="sample-model",
        )
        labels, confidence, margin, probabilities = classifier.predict_embeddings(
            np.asarray([[1.0, 0.0], [0.0, 1.0]], dtype="float32")
        )
        self.assertEqual(labels.tolist(), ["discussion", "recommendation"])
        self.assertTrue(np.all(confidence > 0.5))
        self.assertTrue(np.all(margin > 0))
        np.testing.assert_allclose(probabilities.sum(axis=1), 1.0)

    def test_artifact_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "classifier.npz"
            np.savez_compressed(
                path,
                weights=np.eye(3, 2, dtype="float32"),
                bias=np.zeros(3, dtype="float32"),
                classes=np.asarray(["discussion", "recommendation", "review"]),
                embedding_model=np.asarray("sample-model"),
            )
            classifier = load_content_classifier(path)
        self.assertEqual(classifier.embedding_model, "sample-model")
        self.assertEqual(classifier.weights.shape, (3, 2))

    def test_intent_features_separate_advice_questions_and_reviews(self) -> None:
        features = extract_text_features(
            [
                "You should read this if you enjoy difficult moral choices.",
                "Did anyone else understand that final decision?",
                "The pacing felt uneven, but the ending worked for me.",
            ]
        )
        recommendation = TEXT_FEATURE_NAMES.index("recommendation_intent")
        discussion = TEXT_FEATURE_NAMES.index("discussion_intent")
        evaluation = TEXT_FEATURE_NAMES.index("evaluation_language")
        self.assertEqual(features[:, recommendation].tolist(), [1.0, 0.0, 0.0])
        self.assertEqual(features[:, discussion].tolist(), [0.0, 1.0, 0.0])
        self.assertEqual(features[:, evaluation].tolist(), [0.0, 0.0, 1.0])

    def test_recommendation_requires_explicit_advice(self) -> None:
        classifier = LinearContentClassifier(
            weights=np.zeros((3, 2 + len(TEXT_FEATURE_NAMES)), dtype="float32"),
            bias=np.asarray([0.0, 5.0, 1.0], dtype="float32"),
            classes=np.asarray(["discussion", "recommendation", "review"]),
            embedding_model="sample-model",
            embedding_dimensions=2,
            text_feature_names=TEXT_FEATURE_NAMES,
        )
        labels, _, _, _ = classifier.predict(
            ["The pacing felt uneven.", "You should read this."],
            np.zeros((2, 2), dtype="float32"),
        )
        self.assertEqual(labels.tolist(), ["review", "recommendation"])

    def test_grouped_splits_keep_books_separate(self) -> None:
        labels = ["discussion", "recommendation", "review"]
        rows = []
        for book_id in range(1, 43):
            rows.append(
                {
                    "post_id": book_id,
                    "book_id": book_id,
                    "content": f"Unique example {book_id}",
                    "content_type": labels[(book_id - 1) % 3],
                }
            )
        frame = pd.DataFrame(rows)
        splits = grouped_split_labels(frame)
        self.assertEqual(set(splits), {"train", "validation", "test"})
        grouped = frame.assign(split=splits).groupby("book_id")["split"].nunique()
        self.assertTrue(grouped.eq(1).all())


if __name__ == "__main__":
    unittest.main()
