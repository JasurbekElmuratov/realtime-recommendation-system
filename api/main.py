"""HTTP routes: validate a request, call a service, return JSON."""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.config import Settings
from api.schemas import CreatePostIn, EventResponse, FeedResponse, InteractionEventIn, SearchResponse
from api.services.data_service import DataRepository
from api.services.event_service import EventStore
from api.services.feed_service import FeedService, InvalidCursor
from api.services.recommendation_service import RecommendationService
from api.services.user_service import UserService


class Services:
    """Create the shared objects once when the API starts."""

    def __init__(self, settings: Settings):
        self.data = DataRepository(settings)
        self.events = EventStore(settings.interactions_path)
        self.recommendations = RecommendationService(settings, self.data, self.events)
        self.feed = FeedService(self.data, self.events, self.recommendations)
        self.users = UserService(settings.users_path, self.data, self.events, self.feed)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    services = Services(settings)
    app = FastAPI(title="BookFeed API", version="1.0.0")
    app.state.services = services
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "books": len(services.data.books),
            "posts": services.data.related_post_count,
            "retrieval_mode": services.recommendations.mode,
            "qdrant_configured": bool(settings.qdrant_url and settings.qdrant_api_key),
        }

    @app.get("/health/qdrant")
    def qdrant_health():
        return services.recommendations.qdrant_status()

    @app.get("/feed/{user_id}", response_model=FeedResponse)
    def get_feed(
        user_id: str,
        limit: int = Query(default=10, ge=1, le=50),
        cursor: str | None = None,
        session_id: str = Query(default="api-session", min_length=1, max_length=150),
    ):
        if not services.users.has_user(user_id):
            raise HTTPException(status_code=404, detail="User not found")
        try:
            return services.feed.get_feed(user_id, session_id, limit, cursor)
        except InvalidCursor as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/events", response_model=EventResponse)
    def create_event(event: InteractionEventIn):
        if not services.users.has_user(event.user_id):
            raise HTTPException(status_code=422, detail="Unknown user_id")
        if event.post_id and not services.data.has_post(event.post_id):
            raise HTTPException(status_code=422, detail="Unknown post_id")
        if event.book_id and not services.data.has_book(event.book_id):
            raise HTTPException(status_code=422, detail="Unknown book_id")
        if event.post_id and event.book_id:
            post = services.data.post_row(event.post_id)
            if post is not None and str(post["_book_id"]) != event.book_id:
                raise HTTPException(status_code=422, detail="book_id does not match post_id")
        stored = services.events.append(event)
        version = services.recommendations.profile_version(event.user_id)
        if not stored.duplicate:
            version = services.recommendations.invalidate_user(event.user_id)
        return EventResponse(
            success=True,
            event_id=stored.row["event_id"],
            duplicate=stored.duplicate,
            profile_version=version,
        )

    @app.get("/users/{user_id}")
    def get_user(user_id: str):
        user = services.users.get_user(user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    @app.post("/posts")
    def create_post(post: CreatePostIn):
        identity = services.users.identity(post.user_id)
        if identity is None:
            raise HTTPException(status_code=422, detail="Unknown user_id")
        if not services.data.has_book(post.book_id):
            raise HTTPException(status_code=422, detail="Unknown book_id")
        post_id = services.data.create_post(post.user_id, identity["username"], post.book_id, post.text)
        item = services.feed.neutral_item(post_id, f"created_{post_id}", 1)
        if item is None:
            raise HTTPException(status_code=500, detail="The post was saved but could not be rendered")
        return item

    @app.get("/posts/{post_id}")
    def get_post(post_id: str):
        item = services.feed.neutral_item(post_id, f"post_{post_id}", 1)
        if item is None:
            raise HTTPException(status_code=404, detail="Post not found")
        return item

    @app.get("/search", response_model=SearchResponse)
    def search(
        q: str = Query(min_length=1, max_length=500),
        user_id: str = Query(default="1"),
        session_id: str = Query(default="api-session", min_length=1, max_length=150),
        limit: int = Query(default=12, ge=1, le=50),
    ):
        if not services.users.has_user(user_id):
            raise HTTPException(status_code=404, detail="User not found")
        return services.feed.search(user_id, session_id, q, limit)

    @app.get("/books")
    def books(q: str = "", limit: int = Query(default=50, ge=1, le=350)):
        return {"books": services.data.search_books(q, limit=limit)}

    @app.get("/recommendations/{user_id}/debug")
    def recommendation_debug(user_id: str):
        return services.recommendations.last_debug(user_id)

    return app


app = create_app()
