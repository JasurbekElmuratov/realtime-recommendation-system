from dataclasses import dataclass
from types import SimpleNamespace
import unittest

import numpy as np

from generate_recommendations import build_feed, rank_results, recommend_for_profile


@dataclass
class FakeResult:
    payload: dict[str, object]
    score: float


def result(post_id: int, *, content_type: str, word_count: int, semantic_score: float = 0.8) -> FakeResult:
    return FakeResult({"post_id": post_id, "content": "sample", "content_type": content_type, "word_count": word_count, "view_count": 10, "like_count": 1, "comment_count": 0, "published_at": ""}, semantic_score)


class RecommendationRankingTests(unittest.TestCase):
    def test_short_posts_are_ranked(self) -> None:
        self.assertEqual(len(rank_results([result(1, content_type="review", word_count=3)], [], set())), 1)

    def test_feed_prioritizes_review_then_discussion_then_recommendation(self) -> None:
        candidates = [
            {"result": result(1, content_type="recommendation", word_count=200, semantic_score=0.99), "score": 0.99, "level": 0},
            {"result": result(2, content_type="review", word_count=20), "score": 0.70, "level": 0},
            {"result": result(3, content_type="review", word_count=80), "score": 0.60, "level": 0},
            {"result": result(4, content_type="discussion", word_count=40), "score": 0.80, "level": 0},
        ]
        self.assertEqual([item["result"].payload["post_id"] for item in build_feed(candidates)], [3, 2, 4, 1])

    def test_discussions_are_valid_ranking_candidates(self) -> None:
        self.assertEqual(len(rank_results([result(1, content_type="discussion", word_count=20)], [], set())), 1)

    def test_direct_search_can_fill_ten_items(self) -> None:
        class FakeClient:
            def query_points(self, **options):
                return SimpleNamespace(points=[result(post_id, content_type="review", word_count=20) for post_id in range(1, 13)])
        feed = recommend_for_profile(FakeClient(), object(), np.array([1.0, 0.0], dtype="float32"), [], set(), feed_size=10)
        self.assertEqual(len(feed), 10)
