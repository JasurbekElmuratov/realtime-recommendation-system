"""Request/response shapes. FastAPI checks incoming JSON using these models."""

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EventType(str, Enum):
    impression = "impression"
    post_click = "post_click"
    post_dwell = "post_dwell"
    book_open = "book_open"
    like = "like"
    unlike = "unlike"
    save = "save"
    unsave = "unsave"
    comment = "comment"
    search = "search"
    follow_author = "follow_author"
    not_interested = "not_interested"


class InteractionEventIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    event_id: str | None = Field(default=None, max_length=100)
    user_id: str = Field(min_length=1, max_length=100)
    event_type: EventType
    post_id: str | None = Field(default=None, max_length=100)
    book_id: str | None = Field(default=None, max_length=100)
    query: str | None = Field(default=None, max_length=500)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    session_id: str = Field(min_length=1, max_length=150)
    feed_request_id: str | None = Field(default=None, max_length=150)
    rank_position: int | None = Field(default=None, ge=1, le=10_000)
    recommendation_score: float | None = Field(default=None, ge=-1.0, le=1.0)
    dwell_time_ms: int | None = Field(default=None, ge=0, le=3_600_000)
    post_word_count: int | None = Field(default=None, ge=1, le=10_000)
    expected_reading_time_ms: int | None = Field(default=None, ge=1, le=3_600_000)
    reading_ratio: float | None = Field(default=None, ge=0.0, le=3.0)

    @model_validator(mode="after")
    def validate_event_target(self):
        if self.event_type == EventType.search and not self.query:
            raise ValueError("search events require query")
        if self.event_type in {
            EventType.impression,
            EventType.post_click,
            EventType.post_dwell,
            EventType.like,
            EventType.unlike,
            EventType.save,
            EventType.unsave,
            EventType.comment,
            EventType.not_interested,
        } and not self.post_id:
            raise ValueError(f"{self.event_type.value} events require post_id")
        if self.event_type == EventType.post_dwell and any(
            value is None
            for value in (
                self.dwell_time_ms,
                self.post_word_count,
                self.expected_reading_time_ms,
                self.reading_ratio,
            )
        ):
            raise ValueError("post_dwell events require normalized reading-time metrics")
        if self.event_type in {EventType.book_open, EventType.follow_author} and not self.book_id:
            raise ValueError(f"{self.event_type.value} events require book_id")
        return self


class EventResponse(BaseModel):
    success: bool
    event_id: str
    duplicate: bool = False
    profile_version: int


class CreatePostIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    user_id: str = Field(min_length=1, max_length=100)
    book_id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=320)


class FeedResponse(BaseModel):
    posts: list[dict]
    next_cursor: str | None
    has_more: bool
    feed_request_id: str
    debug: dict


class SearchResponse(BaseModel):
    posts: list[dict]
    books: list[dict]
    feed_request_id: str
