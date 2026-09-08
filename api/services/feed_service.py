"""Turn ranked candidates into feed/search responses and track pagination."""

import base64
import binascii
import json
import uuid

from api.services.data_service import DataRepository
from api.services.event_service import EventStore
from api.services.recommendation_service import RecommendationService


class InvalidCursor(ValueError):
    pass


class FeedService:
    def __init__(self, data: DataRepository, events: EventStore, recommendations: RecommendationService):
        self.data = data
        self.events = events
        self.recommendations = recommendations

    @staticmethod
    def encode_cursor(post_ids: set[str]) -> str:
        # A cursor is the set of IDs already sent to this browser.
        payload = json.dumps({"seen": sorted(post_ids)}, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")

    @staticmethod
    def decode_cursor(cursor: str | None) -> set[str]:
        if not cursor:
            return set()
        try:
            padded = cursor + "=" * (-len(cursor) % 4)
            value = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
            seen = value["seen"]
            if not isinstance(seen, list) or not all(isinstance(item, str) for item in seen):
                raise ValueError
            return set(seen)
        except (ValueError, KeyError, TypeError, binascii.Error) as exc:
            raise InvalidCursor("Invalid feed cursor") from exc

    @staticmethod
    def _reason(topic: str, similarity: float, exact_match: float) -> str:
        if exact_match >= 0.5:
            return "This matches a recent title, author, genre, or search interest."
        if similarity >= 0.65:
            return "Its meaning is strongly aligned with your current reading interests."
        if topic == "general_books":
            return "This popular book discussion adds variety to your feed."
        return "The post balances semantic relevance, freshness, and reader engagement."

    def item_from_candidate(self, item: dict, feed_request_id: str, rank: int) -> dict | None:
        payload = item["result"].payload
        post_id = str(payload["post_id"])
        post = self.data.post_dict(post_id)
        if post is None:
            return None
        book = self.data.book_dict(post["book_id"])
        if book is None:
            return None
        features = item.get("features", {})
        similarity = float(features.get("similarity", item["result"].score))
        exact_match = float(features.get("exact_match", 0))
        popularity = min(
            1.0,
            float(features.get("views", 0)) * 0.55
            + float(features.get("like_rate", 0)) * 0.30
            + float(features.get("comment_rate", 0)) * 0.15,
        )
        topic = str(item.get("topic", "direct_interest"))
        signals = {
            "semantic_similarity": round(similarity, 4),
            "category_interest": round(float(features.get("category_interest", exact_match)), 4),
            "author_affinity": round(float(features.get("author_affinity", 0)), 4),
            "freshness": round(float(features.get("freshness", 0.5)), 4),
            "popularity": round(popularity, 4),
            "final_score": round(float(item.get("score", similarity)), 4),
            "reason": self._reason(topic, similarity, exact_match),
            "model_version": "bookfeed-existing-ranker-v2",
            "source_topic": topic,
        }
        return {
            "post": post,
            "book": book,
            "signals": signals,
            "rank": rank,
            "feed_request_id": feed_request_id,
        }

    def neutral_item(self, post_id: str, request_id: str, rank: int) -> dict | None:
        post = self.data.post_dict(post_id)
        if post is None:
            return None
        book = self.data.book_dict(post["book_id"])
        if book is None:
            return None
        return {
            "post": post,
            "book": book,
            "signals": {
                "semantic_similarity": 0,
                "category_interest": 0,
                "author_affinity": 0,
                "freshness": 0,
                "popularity": 0,
                "final_score": 0,
                "reason": "This item was loaded directly rather than ranked for the feed.",
                "model_version": "direct-data-v1",
                "source_topic": "direct",
            },
            "rank": rank,
            "feed_request_id": request_id,
        }

    def get_feed(self, user_id: str, session_id: str, limit: int, cursor: str | None = None) -> dict:
        seen = self.decode_cursor(cursor)
        if not cursor:
            seen |= self.events.impressed_posts(str(user_id), session_id)
        feed_request_id = f"feed_{uuid.uuid4().hex}"
        result = self.recommendations.recommend(str(user_id), session_id, limit, excluded=seen)
        posts = []
        for candidate in result.candidates:
            item = self.item_from_candidate(candidate, feed_request_id, len(posts) + 1)
            if item is not None and item["post"]["id"] not in seen:
                posts.append(item)
        returned = {item["post"]["id"] for item in posts}
        next_seen = seen | returned
        has_more = bool(posts) and len(next_seen) < self.data.related_post_count
        return {
            "posts": posts,
            "next_cursor": self.encode_cursor(next_seen) if has_more else None,
            "has_more": has_more,
            "feed_request_id": feed_request_id,
            "debug": result.debug,
        }

    def search(self, user_id: str, session_id: str, query: str, limit: int = 12) -> dict:
        request_id = f"search_{uuid.uuid4().hex}"
        result = self.recommendations.recommend(str(user_id), session_id, limit, query=query)
        posts = []
        for rank, candidate in enumerate(result.candidates, 1):
            item = self.item_from_candidate(candidate, request_id, rank)
            if item is not None:
                posts.append(item)
        return {
            "posts": posts,
            "books": self.data.search_books(query, limit=limit),
            "feed_request_id": request_id,
        }

    def items_by_post_ids(self, post_ids: list[str], request_id: str) -> list[dict]:
        items = []
        for rank, post_id in enumerate(post_ids, 1):
            item = self.neutral_item(str(post_id), request_id, rank)
            if item is not None:
                items.append(item)
        return items
