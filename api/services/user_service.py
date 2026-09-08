"""Combine a demo user row with the state rebuilt from their events."""

import csv
from pathlib import Path

from api.services.data_service import DataRepository
from api.services.event_service import EventStore
from api.services.feed_service import FeedService


class UserService:
    def __init__(self, users_path: Path, data: DataRepository, events: EventStore, feed: FeedService):
        self.users_path = Path(users_path)
        self.data = data
        self.events = events
        self.feed = feed

    def _users(self) -> dict[str, dict[str, str]]:
        with self.users_path.open(newline="", encoding="utf-8") as handle:
            return {row["user_id"]: row for row in csv.DictReader(handle)}

    def has_user(self, user_id: str) -> bool:
        return str(user_id) in self._users()

    def identity(self, user_id: str) -> dict[str, str] | None:
        return self._users().get(str(user_id))

    def get_user(self, user_id: str) -> dict | None:
        user = self.identity(user_id)
        if user is None:
            return None
        state = self.events.interaction_state(str(user_id))
        own_post_ids = self.data.user_post_ids(str(user_id), limit=30)
        return {
            "id": user["user_id"],
            "username": user["username"],
            "display_name": user["display_name"],
            "created_at": user["created_at"],
            "profile_version": user.get("profile_version", "1"),
            "last_active_at": user.get("last_active_at", ""),
            "bio": "A new BookFeed reader. This profile grows from activity in the app.",
            "following": 0,
            "followers": 0,
            "post_count": len(self.data.posts[self.data.posts["_user_id"] == str(user_id)]),
            "saved_count": len(state["saved"]),
            "liked_post_ids": sorted(state["liked"]),
            "saved_post_ids": sorted(state["saved"]),
            "not_interested_post_ids": sorted(state["not_interested"]),
            "followed_book_ids": sorted(state["followed_books"]),
            "posts": self.feed.items_by_post_ids(own_post_ids, f"profile_{user_id}"),
            "saved_posts": self.feed.items_by_post_ids(sorted(state["saved"], reverse=True), f"saved_{user_id}"),
            "liked_posts": self.feed.items_by_post_ids(sorted(state["liked"], reverse=True), f"liked_{user_id}"),
            "recent_events": self.events.recent(str(user_id)),
        }
