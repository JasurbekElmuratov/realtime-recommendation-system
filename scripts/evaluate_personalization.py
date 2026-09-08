"""Compare a fresh ranking with one produced after controlled user interactions.

The evaluation writes events only to a temporary CSV. It uses Qdrant Cloud when
credentials are configured, otherwise it exercises the cached-embedding path.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from dataclasses import replace
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from api.config import Settings  # noqa: E402
from api.schemas import EventType, InteractionEventIn  # noqa: E402
from api.services.data_service import DataRepository  # noqa: E402
from api.services.event_service import EventStore  # noqa: E402
from api.services.recommendation_service import RecommendationService  # noqa: E402


def ranked_post_ids(result) -> list[str]:
    return [str(item["result"].payload["post_id"]) for item in result.candidates]


def relevant_ranks(result, relevant_book_ids: set[str]) -> list[int]:
    return [
        rank
        for rank, item in enumerate(result.candidates, 1)
        if str(item["result"].payload.get("book_id", "")) in relevant_book_ids
    ]


def summarize(result, relevant_book_ids: set[str]) -> dict:
    ranks = relevant_ranks(result, relevant_book_ids)
    return {
        "post_ids": ranked_post_ids(result),
        "related_hits": len(ranks),
        "best_related_rank": min(ranks) if ranks else None,
        "retrieval_mode": result.debug["retrieval_mode"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interest", default="dostoevsky", help="Catalog interest to simulate")
    parser.add_argument("--limit", type=int, default=20, choices=range(5, 51), metavar="5-50")
    parser.add_argument("--require-qdrant", action="store_true", help="Fail unless retrieval used Qdrant Cloud")
    args = parser.parse_args()

    base_settings = Settings()
    with tempfile.TemporaryDirectory(prefix="bookfeed-evaluation-") as temporary:
        settings = replace(base_settings, interactions_path=Path(temporary) / "interactions.csv")
        data = DataRepository(settings)
        events = EventStore(settings.interactions_path)
        recommender = RecommendationService(settings, data, events)
        session_id = "evaluation-session"

        matching_books = data.search_books(args.interest, limit=25)
        relevant_book_ids = {book["id"] for book in matching_books}
        if not relevant_book_ids:
            raise SystemExit(f"No catalog books match {args.interest!r}.")
        target_posts = data.related_posts()[data.related_posts()["_book_id"].isin(relevant_book_ids)]
        if target_posts.empty:
            raise SystemExit(f"No related posts match {args.interest!r}.")

        baseline = recommender.recommend("1", session_id, args.limit)
        target = target_posts.iloc[0]
        post_id = str(target["_id"])
        book_id = str(target["_book_id"])
        controlled_events = [
            InteractionEventIn(user_id="1", event_type=EventType.search, query=args.interest, session_id=session_id),
            InteractionEventIn(user_id="1", event_type=EventType.post_click, post_id=post_id, book_id=book_id, session_id=session_id),
            InteractionEventIn(user_id="1", event_type=EventType.like, post_id=post_id, book_id=book_id, session_id=session_id),
            InteractionEventIn(user_id="1", event_type=EventType.save, post_id=post_id, book_id=book_id, session_id=session_id),
            InteractionEventIn(
                user_id="1", event_type=EventType.post_dwell, post_id=post_id, book_id=book_id,
                session_id=session_id, dwell_time_ms=12_000, post_word_count=35,
                expected_reading_time_ms=9_333, reading_ratio=1.286,
            ),
        ]
        for event in controlled_events:
            events.append(event)
        recommender.invalidate_user("1")
        personalized = recommender.recommend("1", session_id, args.limit)

        before = summarize(baseline, relevant_book_ids)
        after = summarize(personalized, relevant_book_ids)
        changed_positions = sum(
            left != right
            for left, right in zip(before["post_ids"], after["post_ids"], strict=False)
        ) + abs(len(before["post_ids"]) - len(after["post_ids"]))
        improved = after["related_hits"] > before["related_hits"] or (
            after["best_related_rank"] is not None
            and (before["best_related_rank"] is None or after["best_related_rank"] < before["best_related_rank"])
        )
        payload = {
            "interest": args.interest,
            "events_applied": [event.event_type.value for event in controlled_events],
            "before": before,
            "after": after,
            "changed_rank_positions": changed_positions,
            "related_ranking_improved": improved,
            "interaction_log": "temporary (the real data/interactions.csv was not changed)",
        }
        print(json.dumps(payload, indent=2))

        if args.require_qdrant and after["retrieval_mode"] != "qdrant-cloud":
            raise SystemExit("Evaluation did not use Qdrant Cloud. Check credentials and collection health.")
        if not changed_positions:
            raise SystemExit("Evaluation failed: controlled interactions did not change the ranking.")
        if not improved:
            raise SystemExit("Evaluation failed: matching books did not improve after controlled interactions.")


if __name__ == "__main__":
    main()
