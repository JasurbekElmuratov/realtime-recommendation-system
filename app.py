"""Interactive English book-profile and recommendation feedback app."""

from __future__ import annotations

import os
from pathlib import Path
import secrets

import numpy as np
import pandas as pd
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer
import streamlit as st

from embedding_model import load_embedding_model
from generate_recommendations import (
    COLLECTION_NAME,
    recommend_for_profile,
)
from personalization import (
    build_post_book_lookup,
    build_profile_vector,
    learn_preference_vector,
    log_book_events,
    log_post_feedback,
    rank_popular_books,
    resolve_post_book,
)


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
BOOKS_FILE = DATA_DIR / "books.csv"
POSTS_FILE = DATA_DIR / "posts.csv"
BOOK_EVENTS_FILE = DATA_DIR / "user_book_events.csv"
POST_EVENTS_FILE = DATA_DIR / "interaction_events.csv"
FEED_SIZE = 5
POPULAR_BOOK_LIMIT = 30


st.set_page_config(
    page_title="Book Feed — Your reading feed",
    page_icon="📚",
    layout="wide",
)

st.markdown(
    """
    <style>
    .stApp { background: #f7f4ed; color: #19352d; }
    .block-container { max-width: 1040px; padding-top: 2.5rem; }
    h1, h2, h3 { color: #173f35; letter-spacing: -0.02em; }
    div[data-testid="stVerticalBlockBorderWrapper"] {
        background: #fffdf8;
        border: 1px solid #ded8c9;
        border-radius: 18px;
        box-shadow: 0 8px 24px rgba(35, 65, 55, 0.06);
    }
    .eyebrow {
        color: #a6552f;
        font-size: .78rem;
        font-weight: 700;
        letter-spacing: .13em;
        text-transform: uppercase;
    }
    .hero-copy { color: #567068; font-size: 1.08rem; max-width: 720px; }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_data
def load_books() -> pd.DataFrame:
    return pd.read_csv(BOOKS_FILE)


@st.cache_data
def load_post_book_lookup() -> dict[int, tuple[int | None, str]]:
    source_posts = pd.read_csv(POSTS_FILE, usecols=["post_id", "book_id"])
    return build_post_book_lookup(source_posts, load_books())


@st.cache_data
def load_popular_books() -> pd.DataFrame:
    columns = [
        "post_id",
        "book_id",
        "view_count",
        "like_count",
        "comment_count",
        "repost_count",
    ]
    posts = pd.read_csv(POSTS_FILE, usecols=columns)
    return rank_popular_books(load_books(), posts, limit=POPULAR_BOOK_LIMIT)


@st.cache_resource
def load_model() -> SentenceTransformer:
    return load_embedding_model()


@st.cache_resource
def load_client(url: str, api_key: str) -> QdrantClient:
    return QdrantClient(url=url, api_key=api_key)


def configured_value(name: str) -> str | None:
    value = os.getenv(name)
    if value:
        return value
    try:
        secret = st.secrets.get(name)
    except Exception:
        return None
    return str(secret) if secret else None


def active_client() -> QdrantClient:
    url = configured_value("QDRANT_URL")
    api_key = configured_value("QDRANT_API_KEY")
    if not url or not api_key:
        raise RuntimeError(
            "Qdrant Cloud is not configured. Set QDRANT_URL and QDRANT_API_KEY."
        )
    return load_client(url, api_key)


def initialize_session() -> None:
    defaults = {
        "stage": "books",
        "user_id": secrets.randbelow(900_000_000) + 100_000_000,
        "profile_vector": None,
        "exact_terms": [],
        "recommendations": [],
        "seen_post_ids": set(),
        "feedback_round": 1,
        "learning_method": None,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def reset_session() -> None:
    for key in list(st.session_state):
        del st.session_state[key]
    st.rerun()


def render_header() -> None:
    st.markdown('<div class="eyebrow">Personal book feed</div>', unsafe_allow_html=True)
    st.title("Books you love. Posts worth reading.")
    st.markdown(
        '<div class="hero-copy">Choose what you have read and what you want to read. '
        "We will build your interest profile and learn "
        "from every like and dislike.</div>",
        unsafe_allow_html=True,
    )


def render_book_selection() -> None:
    books = load_popular_books()
    ids = books["book_id"].tolist()
    labels = {
        row.book_id: f"{row.title} — {row.author}"
        for row in books.itertuples(index=False)
    }

    st.subheader("1. Build your reading profile")
    st.caption(
        "Select exactly three books in each group from the 30 most popular titles."
    )
    cloud_ready = bool(
        configured_value("QDRANT_URL") and configured_value("QDRANT_API_KEY")
    )
    if cloud_ready:
        st.caption("Connected to the configured Qdrant Cloud collection.")
    else:
        st.warning(
            "Qdrant Cloud is required. Configure QDRANT_URL and "
            "QDRANT_API_KEY before creating a profile."
        )
    left, right = st.columns(2, gap="large")
    with left:
        st.markdown("#### I have read")
        read_ids = st.multiselect(
            "Three books you finished",
            ids,
            max_selections=3,
            format_func=lambda value: labels[value],
            placeholder="Search read books",
        )
    with right:
        st.markdown("#### I am interested")
        saved_ids = st.multiselect(
            "Three books you would save",
            ids,
            max_selections=3,
            format_func=lambda value: labels[value],
            placeholder="Search interesting books",
        )

    overlap = set(read_ids) & set(saved_ids)
    if overlap:
        st.warning("Use different books in the two groups.")
    ready = len(read_ids) == 3 and len(saved_ids) == 3 and not overlap
    if st.button(
        "Create my profile and show the top 5 posts",
        type="primary",
        disabled=not ready or not cloud_ready,
        use_container_width=True,
    ):
        try:
            client = active_client()
            if not client.collection_exists(COLLECTION_NAME):
                raise RuntimeError("The Qdrant posts collection does not exist")
            with st.spinner("Building your neural interest profile…"):
                model = load_model()
                profile, terms = build_profile_vector(
                    model,
                    books,
                    read_ids,
                    saved_ids,
                )
                feed = recommend_for_profile(
                    client,
                    model,
                    profile,
                    terms,
                    set(),
                    feed_size=FEED_SIZE,
                )
                log_book_events(
                    BOOK_EVENTS_FILE,
                    st.session_state.user_id,
                    read_ids,
                    saved_ids,
                )
        except Exception as error:
            st.error(f"Could not build the feed: {error}")
            return

        st.session_state.profile_vector = profile
        st.session_state.exact_terms = terms
        st.session_state.recommendations = feed
        st.session_state.stage = "feedback"
        st.rerun()


def point_vector(point: object) -> np.ndarray:
    vector = point.vector
    if isinstance(vector, dict):
        if len(vector) != 1:
            raise ValueError("Expected one vector per post")
        vector = next(iter(vector.values()))
    return np.asarray(vector, dtype="float32")


def retrieve_feedback_vectors(
    client: QdrantClient,
    post_ids: list[int],
) -> dict[int, np.ndarray]:
    points = client.retrieve(
        collection_name=COLLECTION_NAME,
        ids=post_ids,
        with_payload=False,
        with_vectors=True,
    )
    return {int(point.id): point_vector(point) for point in points}


def render_recommendations() -> None:
    feed = st.session_state.recommendations
    if not feed:
        st.error("No recommendations were found for this profile.")
        if st.button("Choose different books"):
            reset_session()
        return

    top_left, top_right = st.columns([4, 1])
    with top_left:
        st.subheader(f"2. Recommendation round {st.session_state.feedback_round}")
        st.caption("Rate every post. Your next five will learn from this round.")
    with top_right:
        if st.button("Start over", use_container_width=True):
            reset_session()

    method = st.session_state.learning_method
    if method == "neural_head":
        st.success("Your neural preference layer was trained. This feed uses the updated profile.")
    elif method == "centroid_update":
        st.info("Your profile was updated from feedback. Both likes and dislikes are needed to train the neural head.")

    feedback: dict[int, bool] = {}
    post_books = load_post_book_lookup()
    for rank, item in enumerate(feed, 1):
        post = item["result"].payload
        post_id = int(post["post_id"])
        book_id, book_title = resolve_post_book(post, post_books)
        with st.container(border=True):
            st.markdown(f"### {rank}. {book_title}")
            st.caption(
                f"{post['content_type'].title()} · Book ID {book_id or 'unknown'} · "
                f"Topic {item['topic']} · "
                f"Feed score {item['score']:.3f}"
            )
            st.write(post["content"])
            choice = st.radio(
                "Your feedback",
                ("👍 Like", "👎 Dislike"),
                index=None,
                horizontal=True,
                key=f"feedback_{st.session_state.feedback_round}_{post_id}",
            )
            if choice:
                feedback[post_id] = choice == "👍 Like"

    complete = len(feedback) == len(feed)
    st.caption(f"Rated {len(feedback)} of {len(feed)} posts")
    if st.button(
        "Train from feedback and show the next 5",
        type="primary",
        disabled=not complete,
        use_container_width=True,
    ):
        try:
            client = active_client()
            post_ids = list(feedback)
            with st.spinner("Training your personalized neural preference layer…"):
                vectors_by_id = retrieve_feedback_vectors(client, post_ids)
                missing = set(post_ids) - set(vectors_by_id)
                if missing:
                    raise RuntimeError("Some feedback post vectors were not found")
                vectors = np.vstack([vectors_by_id[post_id] for post_id in post_ids])
                labels = [int(feedback[post_id]) for post_id in post_ids]
                updated, method = learn_preference_vector(
                    st.session_state.profile_vector,
                    vectors,
                    labels,
                )
                seen = set(st.session_state.seen_post_ids) | set(post_ids)
                new_feed = recommend_for_profile(
                    client,
                    load_model(),
                    updated,
                    st.session_state.exact_terms,
                    {str(post_id) for post_id in seen},
                    feed_size=FEED_SIZE,
                )
                log_post_feedback(
                    POST_EVENTS_FILE,
                    st.session_state.user_id,
                    feedback,
                    f"landing_round_{st.session_state.feedback_round}",
                )
        except Exception as error:
            st.error(f"Could not learn from feedback: {error}")
            return

        st.session_state.profile_vector = updated
        st.session_state.learning_method = method
        st.session_state.seen_post_ids = seen
        st.session_state.recommendations = new_feed
        st.session_state.feedback_round += 1
        st.rerun()


def main() -> None:
    initialize_session()
    render_header()
    st.divider()
    if st.session_state.stage == "books":
        render_book_selection()
    else:
        render_recommendations()


if __name__ == "__main__":
    main()
