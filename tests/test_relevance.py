import unittest

import numpy as np
import pandas as pd

from relevance import cosine_scores, evaluation_metrics, predict_relevance


class FakeModel:
    def encode(self, texts, **_kwargs):
        vectors = {
            "space journey": [1.0, 0.0],
            "astronaut faces danger": [0.9, 0.1],
            "made coffee this morning": [0.0, 1.0],
        }
        return np.asarray([vectors[text] for text in texts], dtype="float32")


class RelevanceTests(unittest.TestCase):
    def test_cosine_scores_compare_corresponding_rows(self) -> None:
        posts = np.asarray([[1.0, 0.0], [0.0, 1.0]])
        books = np.asarray([[0.8, 0.2], [0.3, 0.7]])
        np.testing.assert_allclose(cosine_scores(posts, books), [0.8, 0.7])

    def test_predictions_do_not_depend_on_existing_labels(self) -> None:
        posts = pd.DataFrame(
            {
                "post_id": [1, 2],
                "book_id": [10, 10],
                "content": ["astronaut faces danger", "made coffee this morning"],
                "is_book_related": [0, 1],  # Deliberately incorrect labels.
            }
        )
        books = pd.DataFrame(
            {"book_id": [10], "description": ["space journey"]}
        )
        result = predict_relevance(posts, books, FakeModel(), threshold=0.5)
        self.assertEqual(result["predicted_is_book_related"].tolist(), [1, 0])

    def test_evaluation_reports_confusion_matrix(self) -> None:
        result = pd.DataFrame(
            {
                "is_book_related": [1, 1, 0, 0],
                "predicted_is_book_related": [1, 0, 1, 0],
            }
        )
        metrics = evaluation_metrics(result)
        self.assertEqual(metrics["true_positive"], 1)
        self.assertEqual(metrics["true_negative"], 1)
        self.assertEqual(metrics["false_positive"], 1)
        self.assertEqual(metrics["false_negative"], 1)


if __name__ == "__main__":
    unittest.main()
