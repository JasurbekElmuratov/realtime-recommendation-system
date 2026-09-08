import csv
import shutil
import tempfile
import unittest
from unittest.mock import patch
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient

from api.config import PROJECT_ROOT, Settings
from api.main import create_app


class BookFeedApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        users_path = root / "users.csv"
        users_path.write_text(
            "user_id,username,display_name,created_at,profile_version,last_active_at\n"
            "1,bookfeed_reader,BookFeed Reader,2026-09-03T00:00:00+00:00,1,\n",
            encoding="utf-8",
        )
        posts_path = root / "posts.csv"
        shutil.copyfile(PROJECT_ROOT / "data" / "posts.csv", posts_path)
        settings = Settings(
            books_path=PROJECT_ROOT / "data" / "books.csv",
            posts_path=posts_path,
            processed_posts_path=root / "missing-processed.csv",
            embeddings_path=root / "missing-embeddings.npy",
            users_path=users_path,
            interactions_path=root / "interactions.csv",
            covers_path=root / "covers",
            cors_origins=("http://localhost:3000",),
            qdrant_url=None,
            qdrant_api_key=None,
            disable_embeddings=True,
        )
        self.settings = settings
        self.app = create_app(settings)
        self.client = TestClient(self.app)
        data = self.app.state.services.data
        self.post_id = str(data.related_posts().iloc[0]["_id"])
        self.book_id = str(data.related_posts().iloc[0]["_book_id"])
        self.interactions_path = settings.interactions_path

    def tearDown(self):
        self.temporary.cleanup()

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertEqual(response.json()["books"], 350)
        self.assertFalse(response.json()["qdrant_configured"])

    def test_qdrant_health_reports_unconfigured_without_network_access(self):
        response = self.client.get("/health/qdrant")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["collection"], "posts")
        self.assertFalse(response.json()["configured"])
        self.assertFalse(response.json()["connected"])

    def test_cloud_failure_without_cache_reports_csv_fallback(self):
        recommender = self.app.state.services.recommendations
        with (
            patch.object(recommender, "_profile", return_value=([1.0], [], [])),
            patch.object(recommender, "_get_model", return_value=object()),
            patch.object(recommender, "_get_qdrant", return_value=object()),
            patch("api.services.recommendation_service.recommend_for_profile", side_effect=RuntimeError("offline")),
        ):
            with self.assertLogs("api.services.recommendation_service", level="WARNING"):
                result = recommender.recommend("1", "test-session", 10)
        self.assertEqual(result.debug["retrieval_mode"], "csv-fallback")
        self.assertEqual(len(result.candidates), 10)

    def test_feed_defaults_to_ten_real_posts(self):
        response = self.client.get("/feed/1", params={"session_id": "test-session"})
        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(payload["posts"]), 10)
        self.assertTrue(payload["has_more"])
        self.assertTrue(all(item["book"]["title"] for item in payload["posts"]))
        self.assertTrue(all(item["post"]["word_count"] > 0 for item in payload["posts"]))
        book_counts = Counter(item["book"]["id"] for item in payload["posts"])
        author_counts = Counter(item["book"]["author"] for item in payload["posts"])
        self.assertLessEqual(max(book_counts.values()), 2)
        self.assertLessEqual(max(author_counts.values()), 3)

    def test_single_post_endpoint_supports_shareable_detail_page(self):
        response = self.client.get(f"/posts/{self.post_id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["post"]["id"], self.post_id)
        self.assertEqual(response.json()["book"]["id"], self.book_id)
        self.assertEqual(self.client.get("/posts/not-a-post").status_code, 404)

    def test_cursor_pages_do_not_duplicate_posts(self):
        first = self.client.get("/feed/1", params={"session_id": "test-session"}).json()
        second = self.client.get(
            "/feed/1",
            params={"session_id": "test-session", "cursor": first["next_cursor"]},
        ).json()
        first_ids = {item["post"]["id"] for item in first["posts"]}
        second_ids = {item["post"]["id"] for item in second["posts"]}
        self.assertEqual(len(second["posts"]), 10)
        self.assertFalse(first_ids & second_ids)

    def test_event_validation_rejects_missing_target(self):
        response = self.client.post(
            "/events",
            json={"user_id": "1", "event_type": "like", "timestamp": "2026-09-03T12:00:00Z", "session_id": "test-session"},
        )
        self.assertEqual(response.status_code, 422)

    def test_interaction_is_persisted_and_updates_profile_version(self):
        response = self.client.post(
            "/events",
            json={
                "event_id": "event-test-like", "user_id": "1", "event_type": "like", "post_id": self.post_id,
                "book_id": self.book_id, "timestamp": "2026-09-03T12:00:00Z", "session_id": "test-session",
                "feed_request_id": "feed-test", "rank_position": 3, "recommendation_score": 0.71,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile_version"], 1)
        with self.interactions_path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(rows[0]["event_id"], "event-test-like")
        self.assertEqual(rows[0]["feed_request_id"], "feed-test")

    def test_dwell_event_requires_and_persists_normalized_reading_metrics(self):
        missing = self.client.post(
            "/events",
            json={
                "user_id": "1", "event_type": "post_dwell", "post_id": self.post_id,
                "book_id": self.book_id, "session_id": "test-session",
            },
        )
        self.assertEqual(missing.status_code, 422)

        response = self.client.post(
            "/events",
            json={
                "event_id": "event-test-dwell", "user_id": "1", "event_type": "post_dwell",
                "post_id": self.post_id, "book_id": self.book_id, "session_id": "test-session",
                "feed_request_id": "feed-test", "rank_position": 2, "recommendation_score": 0.62,
                "dwell_time_ms": 8000, "post_word_count": 30,
                "expected_reading_time_ms": 8000, "reading_ratio": 1.0,
            },
        )
        self.assertEqual(response.status_code, 200)
        with self.interactions_path.open(newline="", encoding="utf-8") as handle:
            row = list(csv.DictReader(handle))[0]
        self.assertEqual(row["dwell_time_ms"], "8000")
        self.assertEqual(row["post_word_count"], "30")
        self.assertEqual(row["expected_reading_time_ms"], "8000")
        self.assertEqual(row["reading_ratio"], "1.0")
        recommender = self.app.state.services.recommendations
        self.assertEqual(recommender._event_weight(row), 0.65)

    def test_impressions_are_deduplicated_per_batch(self):
        event = {
            "event_id": "event-impression-one", "user_id": "1", "event_type": "impression", "post_id": self.post_id,
            "book_id": self.book_id, "timestamp": "2026-09-03T12:00:00Z", "session_id": "test-session", "feed_request_id": "feed-test",
        }
        self.assertFalse(self.client.post("/events", json=event).json()["duplicate"])
        event["event_id"] = "event-impression-two"
        self.assertTrue(self.client.post("/events", json=event).json()["duplicate"])

    def test_not_interested_post_is_removed_from_future_feeds(self):
        response = self.client.post(
            "/events",
            json={
                "user_id": "1", "event_type": "not_interested", "post_id": self.post_id,
                "book_id": self.book_id, "session_id": "test-session",
            },
        )
        self.assertEqual(response.status_code, 200)
        feed = self.client.get("/feed/1", params={"session_id": "new-session"}).json()
        self.assertNotIn(self.post_id, {item["post"]["id"] for item in feed["posts"]})

    def test_missing_cover_uses_static_fallback(self):
        response = self.client.get("/books", params={"limit": 1})
        self.assertEqual(response.json()["books"][0]["cover_url"], "/book-covers/default.svg")

    def test_user_lookup_returns_csv_profile_and_interaction_state(self):
        self.client.post(
            "/events",
            json={"user_id": "1", "event_type": "save", "post_id": self.post_id, "book_id": self.book_id, "session_id": "test-session"},
        )
        response = self.client.get("/users/1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "bookfeed_reader")
        self.assertIn(self.post_id, response.json()["saved_post_ids"])

    def test_new_user_starts_without_history(self):
        profile = self.client.get("/users/1").json()
        self.assertEqual(profile["post_count"], 0)
        self.assertEqual(profile["liked_post_ids"], [])
        self.assertEqual(profile["saved_post_ids"], [])
        self.assertEqual(profile["recent_events"], [])

    def test_liked_posts_are_returned_for_profile(self):
        self.client.post(
            "/events",
            json={"user_id": "1", "event_type": "like", "post_id": self.post_id, "book_id": self.book_id, "session_id": "test-session"},
        )
        profile = self.client.get("/users/1").json()
        self.assertEqual(profile["liked_posts"][0]["post"]["id"], self.post_id)

    def test_create_post_is_saved_and_visible_on_profile(self):
        response = self.client.post(
            "/posts",
            json={"user_id": "1", "book_id": self.book_id, "text": "A new reader-created thought."},
        )
        self.assertEqual(response.status_code, 200)
        post_id = response.json()["post"]["id"]
        profile = self.client.get("/users/1").json()
        self.assertIn(post_id, {item["post"]["id"] for item in profile["posts"]})

        # A restart must read the post from the CSV, not just from memory.
        restarted = TestClient(create_app(self.settings))
        saved_post = restarted.get(f"/posts/{post_id}")
        self.assertEqual(saved_post.status_code, 200)
        self.assertEqual(saved_post.json()["post"]["text"], "A new reader-created thought.")

    def test_likes_and_saves_can_be_undone_after_restart(self):
        event = {
            "user_id": "1", "post_id": self.post_id,
            "book_id": self.book_id, "session_id": "test-session",
        }
        for action in ("like", "save"):
            response = self.client.post("/events", json={**event, "event_type": action})
            self.assertEqual(response.status_code, 200)

        restarted = TestClient(create_app(self.settings))
        profile = restarted.get("/users/1").json()
        self.assertIn(self.post_id, profile["liked_post_ids"])
        self.assertIn(self.post_id, profile["saved_post_ids"])

        for action in ("unlike", "unsave"):
            response = restarted.post("/events", json={**event, "event_type": action})
            self.assertEqual(response.status_code, 200)

        restarted_again = TestClient(create_app(self.settings))
        profile = restarted_again.get("/users/1").json()
        self.assertEqual(profile["liked_post_ids"], [])
        self.assertEqual(profile["saved_post_ids"], [])
        self.assertEqual(profile["liked_posts"], [])
        self.assertEqual(profile["saved_posts"], [])

    def test_retrying_an_event_does_not_duplicate_history(self):
        event = {
            "event_id": "retry-this-save", "event_type": "save", "user_id": "1",
            "post_id": self.post_id, "book_id": self.book_id, "session_id": "test-session",
        }
        first = self.client.post("/events", json=event).json()
        second = self.client.post("/events", json=event).json()
        self.assertFalse(first["duplicate"])
        self.assertTrue(second["duplicate"])
        self.assertEqual(second["profile_version"], first["profile_version"])
        profile = self.client.get("/users/1").json()
        self.assertEqual(len(profile["recent_events"]), 1)

    def test_concurrent_events_keep_every_csv_row(self):
        def save_event(number):
            return self.client.post("/events", json={
                "event_id": f"concurrent-save-{number}", "event_type": "save", "user_id": "1",
                "post_id": self.post_id, "book_id": self.book_id, "session_id": "test-session",
            })

        with ThreadPoolExecutor(max_workers=4) as workers:
            responses = list(workers.map(save_event, range(8)))
        self.assertTrue(all(response.status_code == 200 for response in responses))
        with self.interactions_path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 8)
        self.assertEqual({row["event_id"] for row in rows}, {f"concurrent-save-{number}" for number in range(8)})

    def test_search_returns_posts_books_and_matching_debug_snapshot(self):
        response = self.client.get(
            "/search", params={"q": "dostoevsky", "user_id": "1", "session_id": "search-session"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["books"])
        self.assertTrue(all("dostoevsky" in book["author"].lower() for book in payload["books"]))
        self.assertTrue(payload["posts"])
        self.assertTrue(all(item["feed_request_id"] == payload["feed_request_id"] for item in payload["posts"]))
        debug = self.client.get("/recommendations/1/debug").json()
        self.assertEqual(debug["final_recommendation_ids"], [item["post"]["id"] for item in payload["posts"]])

    def test_invalid_cursor_is_reported_as_a_client_error(self):
        response = self.client.get("/feed/1", params={"cursor": "not-a-valid-cursor"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Invalid feed cursor")


if __name__ == "__main__":
    unittest.main()
