"""Save events to CSV and replay them to rebuild likes, saves, and follows."""

import csv
import threading
import uuid
from dataclasses import dataclass
from datetime import timezone
from pathlib import Path

from api.schemas import InteractionEventIn


INTERACTION_COLUMNS = [
    "event_id",
    "user_id",
    "event_type",
    "post_id",
    "book_id",
    "query",
    "timestamp",
    "session_id",
    "feed_request_id",
    "rank_position",
    "recommendation_score",
    "dwell_time_ms",
    "post_word_count",
    "expected_reading_time_ms",
    "reading_ratio",
]


@dataclass(frozen=True)
class StoredEvent:
    row: dict[str, str]
    duplicate: bool


class EventStore:
    """One event log for the local, single-process demo."""

    def __init__(self, path: Path):
        self.path = Path(path)
        # FastAPI can handle requests on multiple threads. Write one at a time.
        self._lock = threading.Lock()
        self._ensure_file()

    def _ensure_file(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists() and self.path.stat().st_size:
            with self.path.open(newline="", encoding="utf-8") as handle:
                header = next(csv.reader(handle), [])
            if header != INTERACTION_COLUMNS:
                raise ValueError(f"Unexpected interaction CSV schema in {self.path}")
            return
        with self.path.open("w", newline="", encoding="utf-8") as handle:
            csv.DictWriter(handle, fieldnames=INTERACTION_COLUMNS).writeheader()

    def rows(self, user_id: str | None = None) -> list[dict[str, str]]:
        with self._lock:
            with self.path.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
        if user_id is None:
            return rows
        return [row for row in rows if row["user_id"] == str(user_id)]

    def append(self, event: InteractionEventIn) -> StoredEvent:
        event_id = event.event_id or f"event_{uuid.uuid4().hex}"
        timestamp = event.timestamp
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        # Pydantic already validated the event. CSV stores each value as text.
        values = event.model_dump(mode="json")
        values["event_id"] = event_id
        values["timestamp"] = timestamp.astimezone(timezone.utc).isoformat()
        row = {}
        for column in INTERACTION_COLUMNS:
            value = values[column]
            row[column] = "" if value is None else str(value)

        with self._lock:
            with self.path.open("r+", newline="", encoding="utf-8") as handle:
                existing = list(csv.DictReader(handle))
                for saved in existing:
                    if saved["event_id"] == event_id:
                        return StoredEvent(row=saved, duplicate=True)

                    # Scrolling away and back must not count the same impression twice.
                    same_impression = (
                        row["event_type"] == "impression"
                        and saved["event_type"] == "impression"
                        and saved["user_id"] == row["user_id"]
                        and saved["session_id"] == row["session_id"]
                        and saved["feed_request_id"] == row["feed_request_id"]
                        and saved["post_id"] == row["post_id"]
                    )
                    if same_impression:
                        return StoredEvent(row=saved, duplicate=True)

                handle.seek(0, 2)  # Move to the end, keeping all earlier events.
                csv.DictWriter(handle, fieldnames=INTERACTION_COLUMNS).writerow(row)
        return StoredEvent(row=row, duplicate=False)

    def interaction_state(self, user_id: str) -> dict[str, set[str]]:
        liked: set[str] = set()
        saved: set[str] = set()
        hidden: set[str] = set()
        followed_books: set[str] = set()
        for row in self.rows(user_id=str(user_id)):
            post_id = row["post_id"]
            event_type = row["event_type"]
            if event_type == "like" and post_id:
                liked.add(post_id)
            elif event_type == "unlike" and post_id:
                liked.discard(post_id)
            elif event_type == "save" and post_id:
                saved.add(post_id)
            elif event_type == "unsave" and post_id:
                saved.discard(post_id)
            elif event_type == "not_interested" and post_id:
                hidden.add(post_id)
            elif event_type == "follow_author" and row["book_id"]:
                followed_books.add(row["book_id"])
        return {
            "liked": liked,
            "saved": saved,
            "not_interested": hidden,
            "followed_books": followed_books,
        }

    def recent(self, user_id: str, limit: int = 30) -> list[dict[str, str]]:
        return list(reversed(self.rows(user_id=str(user_id))))[:limit]

    def impressed_posts(self, user_id: str, session_id: str) -> set[str]:
        return {
            row["post_id"]
            for row in self.rows(user_id=str(user_id))
            if row["session_id"] == session_id and row["event_type"] == "impression" and row["post_id"]
        }
