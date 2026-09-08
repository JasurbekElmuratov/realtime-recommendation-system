"""Build interests from events, find candidates, then rank and diversify them."""

import time
import logging
from collections import Counter
from dataclasses import dataclass
from types import SimpleNamespace

import numpy as np
import pandas as pd
from qdrant_client import QdrantClient

from api.config import Settings
from api.services.data_service import DataRepository, _string_id
from api.services.event_service import EventStore
from embedding_model import load_embedding_model
from generate_recommendations import COLLECTION_NAME, build_feed, rank_results, recommend_for_profile
from genre_taxonomy import GENERAL_BOOK_PROFILE, GENERAL_BOOK_TERMS
from personalization import normalize_vector


LOGGER = logging.getLogger(__name__)


EVENT_WEIGHTS = {
    "post_click": 0.25,
    "post_dwell": 0.65,
    "book_open": 0.40,
    "search": 0.55,
    "like": 0.80,
    "unlike": -0.80,
    "save": 1.00,
    "unsave": -1.00,
    "comment": 0.60,
    "follow_author": 0.75,
    "not_interested": -0.90,
}
DEFAULT_SESSION_WEIGHT = 0.45
SEARCH_SESSION_WEIGHT = 0.65
AUTHOR_AFFINITY_BONUS = 0.10
TITLE_AFFINITY_BONUS = 0.07
CATEGORY_AFFINITY_BONUS = 0.04
MAX_CATALOG_BONUS = 0.14
MAX_POSTS_PER_BOOK = 2
MAX_POSTS_PER_AUTHOR = 3


@dataclass
class RecommendationResult:
    candidates: list[dict]
    debug: dict


class RecommendationService:
    """The website recommendation pipeline. Start reading at recommend()."""

    def __init__(self, settings: Settings, data: DataRepository, events: EventStore):
        self.settings = settings
        self.data = data
        self.events = events
        self._model = None
        self._qdrant = None
        self._local_embeddings = None
        self._processed_posts = None
        self._profile_versions: Counter[str] = Counter()
        self._last_debug: dict[str, dict] = {}

    @property
    def mode(self) -> str:
        if self.settings.disable_embeddings:
            return "csv-fallback"
        if self.settings.qdrant_url and self.settings.qdrant_api_key:
            return "qdrant-cloud"
        if self.settings.embeddings_path.exists() and self.settings.processed_posts_path.exists():
            return "cached-embeddings"
        return "csv-fallback"

    def profile_version(self, user_id: str) -> int:
        return self._profile_versions[str(user_id)]

    def invalidate_user(self, user_id: str) -> int:
        # The next request always rebuilds the profile from saved events.
        self._profile_versions[str(user_id)] += 1
        return self._profile_versions[str(user_id)]

    def last_debug(self, user_id: str) -> dict:
        return self._last_debug.get(str(user_id), self._empty_debug())

    @staticmethod
    def _empty_debug() -> dict:
        return {
            "generated_at": "",
            "profile": [],
            "candidate_generation_count": 0,
            "retrieved_candidate_count": 0,
            "ranked_candidate_count": 0,
            "final_recommendation_ids": [],
            "candidates": [],
            "latency": {"profile_ms": 0, "retrieval_ms": 0, "ranking_ms": 0, "total_ms": 0},
            "retrieval_mode": "unavailable",
        }

    def _get_model(self):
        if self.settings.disable_embeddings:
            return None
        if self._model is None:
            self._model = load_embedding_model()
        return self._model

    def _get_qdrant(self):
        if not self.settings.qdrant_url or not self.settings.qdrant_api_key:
            return None
        if self._qdrant is None:
            self._qdrant = QdrantClient(
                url=self.settings.qdrant_url,
                api_key=self.settings.qdrant_api_key,
            )
        return self._qdrant

    def qdrant_status(self) -> dict:
        """Check the configured Cloud collection without exposing credentials."""
        status = {
            "configured": bool(self.settings.qdrant_url and self.settings.qdrant_api_key),
            "connected": False,
            "collection": COLLECTION_NAME,
            "points_count": None,
        }
        if not status["configured"]:
            return status
        try:
            collection = self._get_qdrant().get_collection(COLLECTION_NAME)
            status["connected"] = True
            status["points_count"] = getattr(collection, "points_count", None)
        except Exception as exc:
            status["error"] = str(exc)
        return status

    @staticmethod
    def _event_weight(row: dict[str, str]) -> float:
        """Return a signed profile weight, normalizing dwell by post length."""
        event_type = row.get("event_type", "")
        base = EVENT_WEIGHTS.get(event_type, 0.0)
        if event_type != "post_dwell":
            return base
        try:
            dwell_time_ms = int(row.get("dwell_time_ms") or 0)
            reading_ratio = float(row.get("reading_ratio") or 0.0)
        except (TypeError, ValueError):
            return 0.0
        if dwell_time_ms < 2_000:
            return 0.0
        return base * min(max(reading_ratio, 0.0), 1.0)

    def _load_local_index(self):
        if self._local_embeddings is None:
            self._local_embeddings = np.load(self.settings.embeddings_path)
            self._processed_posts = pd.read_csv(self.settings.processed_posts_path)
            if len(self._processed_posts) != len(self._local_embeddings):
                raise ValueError("posts_processed.csv and post_embeddings.npy are out of sync")
        return self._processed_posts, self._local_embeddings

    def _weighted_vector(self, rows: list[dict[str, str]], base_vector=None):
        model = self._get_model()
        if model is None:
            return base_vector
        texts: list[str] = []
        weights: list[float] = []
        for row in rows[-120:]:
            weight = self._event_weight(row)
            text = self.data.event_text(row)
            if weight and text:
                texts.append(text)
                weights.append(weight)
        if not texts:
            return base_vector
        vectors = model.encode(texts, normalize_embeddings=True)
        # Positive actions pull the profile toward a post; negative ones push away.
        combined = np.zeros(vectors.shape[1])
        for vector, weight in zip(vectors, weights):
            combined += vector * weight
        if np.linalg.norm(combined) <= 1e-8:
            return base_vector
        if base_vector is not None:
            combined = np.asarray(base_vector) + 0.35 * normalize_vector(combined)
        return normalize_vector(combined)

    def _profile(self, user_id: str, session_id: str):
        model = self._get_model()
        rows = self.events.rows(user_id=str(user_id))
        active_rows = []
        session_rows = []
        historical_rows = []
        positive_rows = []
        for row in rows:
            if row["event_type"] == "impression":
                continue  # Seeing a card alone does not prove interest.
            active_rows.append(row)
            if row["session_id"] == session_id:
                session_rows.append(row)
            else:
                historical_rows.append(row)
            if self._event_weight(row) > 0:
                positive_rows.append(row)
        terms = self.data.profile_terms(positive_rows[-80:]) or list(GENERAL_BOOK_TERMS)

        if model is None:
            return None, terms, self._profile_summary(active_rows)
        base = model.encode(GENERAL_BOOK_PROFILE, normalize_embeddings=True)
        long_term = self._weighted_vector(historical_rows, base_vector=base)
        session = self._weighted_vector(session_rows)
        if session is None:
            current = long_term
        else:
            session_weight = DEFAULT_SESSION_WEIGHT
            for row in session_rows:
                if row["event_type"] == "search":
                    session_weight = SEARCH_SESSION_WEIGHT
                    break
            # Mix older interests with what the reader wants in this session.
            current = normalize_vector((1 - session_weight) * long_term + session_weight * session)
        return current, terms, self._profile_summary(active_rows)

    def _profile_summary(self, rows: list[dict[str, str]]) -> list[dict]:
        counts: Counter[str] = Counter()
        for row in rows[-100:]:
            weight = self._event_weight(row)
            if row.get("query"):
                counts[row["query"]] += weight
            post = self.data.post_row(row.get("post_id", ""))
            book_id = row.get("book_id") or (post["_book_id"] if post is not None else "")
            book = self.data.book_row(book_id)
            if book is not None:
                counts[str(book["genre"])] += weight
        positive_counts = [(interest, weight) for interest, weight in counts.most_common() if weight > 0]
        if not positive_counts:
            return []
        return [
            {"interest": interest, "weight": round(float(weight), 2)}
            for interest, weight in positive_counts[:8]
        ]

    def _local_candidates(self, vector, terms: list[str], blocked: set[str], target: int) -> list[dict]:
        if vector is not None and self.settings.embeddings_path.exists() and self.settings.processed_posts_path.exists():
            processed, embeddings = self._load_local_index()
            similarities = np.asarray(embeddings) @ np.asarray(vector)
            # Fetch extra candidates because some were already shown or hidden.
            candidate_window = min(len(processed), max(len(blocked) + target * 3, 100))
            indexes = np.argsort(similarities)[::-1][:candidate_window]
        else:
            processed = self.data.related_posts().copy()
            similarities = np.full(len(processed), 0.25)
            indexes = np.arange(len(processed))

        results = []
        for index in indexes:
            row = processed.iloc[int(index)]
            post_id = _string_id(row["post_id"])
            raw = self.data.post_row(post_id)
            if raw is None or post_id in blocked:
                continue
            raw_word_count = len(str(raw["content"]).split())
            processed_word_count = row.get("word_count")
            word_count = raw_word_count
            if processed_word_count is not None and not pd.isna(processed_word_count):
                word_count = int(processed_word_count)
            payload = {
                "post_id": post_id,
                "book_id": _string_id(raw["book_id"]),
                "content": str(raw["content"]),
                "content_type": str(row.get("content_type", self.data._content_types.get(post_id, "discussion"))),
                "word_count": word_count,
                "view_count": int(raw["view_count"]),
                "like_count": int(raw["like_count"]),
                "comment_count": int(raw["comment_count"]),
                "published_at": str(raw["published_at"]),
            }
            results.append(SimpleNamespace(payload=payload, score=float(similarities[int(index)])))

        ranked = rank_results(results, terms, blocked)
        for item in ranked:
            item["topic"] = "direct_interest" if vector is not None else "general_books"
            item["level"] = 0 if vector is not None else 4
        return build_feed(ranked, target)

    @staticmethod
    def _term_matches(value: str, terms: list[str]) -> bool:
        normalized = value.casefold().strip()
        if not normalized:
            return False
        for term in terms:
            if len(term) >= 3 and (term in normalized or normalized in term):
                return True
        return False

    def _rerank_with_catalog_affinity(self, candidates: list[dict], terms: list[str]) -> list[dict]:
        """Apply a small metadata bonus after the existing semantic ranker."""
        lowered_terms = [term.casefold().strip() for term in terms if term.strip()]
        for item in candidates:
            payload = item["result"].payload
            book = self.data.book_dict(str(payload.get("book_id", ""))) or {}
            author_affinity = 1.0 if self._term_matches(str(book.get("author", "")), lowered_terms) else 0.0
            title_affinity = 1.0 if self._term_matches(str(book.get("title", "")), lowered_terms) else 0.0
            category_affinity = 0.0
            for genre in book.get("genres", []):
                if self._term_matches(genre, lowered_terms):
                    category_affinity = 1.0
                    break
            bonus = min(
                MAX_CATALOG_BONUS,
                AUTHOR_AFFINITY_BONUS * author_affinity
                + TITLE_AFFINITY_BONUS * title_affinity
                + CATEGORY_AFFINITY_BONUS * category_affinity,
            )
            item["features"]["author_affinity"] = author_affinity
            item["features"]["title_affinity"] = title_affinity
            item["features"]["category_interest"] = category_affinity
            item["features"]["catalog_affinity_bonus"] = bonus
            item["score"] = min(1.0, float(item["score"]) + bonus)
        def candidate_order(item):
            # Lower topic levels come first; within a level, higher scores win.
            level = int(item.get("level", 4))
            score = float(item["score"])
            similarity = float(item["features"].get("similarity", 0.0))
            return (level, -score, -similarity)

        return sorted(candidates, key=candidate_order)

    def _select_diverse(self, candidates: list[dict], blocked: set[str], limit: int) -> list[dict]:
        """Prefer variety while still filling the requested batch when needed."""
        selected: list[dict] = []
        deferred: list[dict] = []
        seen_posts: set[str] = set()
        book_counts: Counter[str] = Counter()
        author_counts: Counter[str] = Counter()

        for item in candidates:
            payload = item["result"].payload
            post_id = str(payload["post_id"])
            if post_id in seen_posts or post_id in blocked or not self.data.has_post(post_id):
                continue
            seen_posts.add(post_id)
            book_id = str(payload.get("book_id", ""))
            book = self.data.book_dict(book_id) or {}
            author = str(book.get("author", "Unknown"))
            if book_counts[book_id] >= MAX_POSTS_PER_BOOK or author_counts[author] >= MAX_POSTS_PER_AUTHOR:
                deferred.append(item)
                continue
            selected.append(item)
            book_counts[book_id] += 1
            author_counts[author] += 1
            if len(selected) == limit:
                return selected

        for item in deferred:
            if len(selected) == limit:
                break
            selected.append(item)
        return selected

    def recommend(
        self,
        user_id: str,
        session_id: str,
        limit: int,
        excluded: set[str] | None = None,
        query: str | None = None,
    ) -> RecommendationResult:
        started = time.perf_counter()
        # 1. Build a user vector, or use the explicit search as the query vector.
        vector, terms, profile_summary = self._profile(str(user_id), session_id)
        if query:
            model = self._get_model()
            if model is not None:
                vector = model.encode(self.data.query_context(query), normalize_embeddings=True)
            terms = [query]
        profile_ms = (time.perf_counter() - started) * 1000

        # 2. Exclude hidden/previously returned posts and retrieve extra candidates.
        state = self.events.interaction_state(str(user_id))
        blocked = set(excluded or set()) | state["not_interested"]
        target = max(limit * 3, 30)
        retrieval_started = time.perf_counter()
        client = self._get_qdrant()
        if client is not None and vector is not None:
            try:
                candidates = recommend_for_profile(client, self._get_model(), vector, terms, blocked, feed_size=target)
                mode = "qdrant-cloud"
            except Exception as exc:
                LOGGER.warning("Qdrant retrieval failed; using local retrieval: %s", exc)
                candidates = self._local_candidates(vector, terms, blocked, target)
                if self.settings.embeddings_path.exists() and self.settings.processed_posts_path.exists():
                    mode = "cached-embeddings-fallback"
                else:
                    mode = "csv-fallback"
        else:
            candidates = self._local_candidates(vector, terms, blocked, target)
            mode = self.mode
        retrieval_ms = (time.perf_counter() - retrieval_started) * 1000

        # 3. Add small catalog bonuses, then limit repeated books and authors.
        ranked_candidates = self._rerank_with_catalog_affinity(candidates, terms)
        unique = self._select_diverse(ranked_candidates, blocked, limit)

        ranking_ms = max(0.0, (time.perf_counter() - retrieval_started) * 1000 - retrieval_ms)
        total_ms = (time.perf_counter() - started) * 1000
        # 4. Return the chosen candidates plus numbers shown in the ML Inspector.
        selected_ids = [str(item["result"].payload["post_id"]) for item in unique]
        debug_candidates = []
        for item in ranked_candidates[:30]:
            payload = item["result"].payload
            post_id = str(payload["post_id"])
            book = self.data.book_dict(str(payload.get("book_id", ""))) or {}
            debug_candidates.append({
                "post_id": post_id,
                "book_title": book.get("title", "Unknown"),
                "source": item.get("topic", "direct_interest").replace("_", "-"),
                "similarity": round(float(item["features"]["similarity"]), 4),
                "final_score": round(float(item["score"]), 4),
                "selected": post_id in selected_ids,
            })
        debug = {
            "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
            "profile": profile_summary,
            "candidate_generation_count": len(candidates),
            "retrieved_candidate_count": len(candidates),
            "ranked_candidate_count": len(candidates),
            "final_recommendation_ids": selected_ids,
            "candidates": debug_candidates,
            "latency": {
                "profile_ms": round(profile_ms, 2),
                "retrieval_ms": round(retrieval_ms, 2),
                "ranking_ms": round(ranking_ms, 2),
                "total_ms": round(total_ms, 2),
            },
            "retrieval_mode": mode,
            "profile_version": self.profile_version(str(user_id)),
        }
        self._last_debug[str(user_id)] = debug
        return RecommendationResult(candidates=unique, debug=debug)
