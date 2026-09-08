import { apiFetch } from "@/services/api";
import type { ApiEvent, ApiUser } from "@/services/contracts";
import { mapFeedItem } from "@/services/feed";
import type { BookFeedUser, InteractionEvent } from "@/types";

function mapEvent(event: ApiEvent): InteractionEvent {
  return {
    id: event.event_id,
    userId: event.user_id,
    eventType: event.event_type,
    postId: event.post_id || undefined,
    bookId: event.book_id || undefined,
    query: event.query || undefined,
    timestamp: event.timestamp,
    sessionId: event.session_id,
    feedRequestId: event.feed_request_id || undefined,
    rankPosition: event.rank_position ? Number(event.rank_position) : undefined,
    recommendationScore: event.recommendation_score
      ? Number(event.recommendation_score)
      : undefined,
    dwellTimeMs: event.dwell_time_ms ? Number(event.dwell_time_ms) : undefined,
    postWordCount: event.post_word_count
      ? Number(event.post_word_count)
      : undefined,
    expectedReadingTimeMs: event.expected_reading_time_ms
      ? Number(event.expected_reading_time_ms)
      : undefined,
    readingRatio: event.reading_ratio ? Number(event.reading_ratio) : undefined,
    syncStatus: "synced",
  };
}

async function getUser(userId: string): Promise<BookFeedUser> {
  const user = await apiFetch<ApiUser>(`/users/${encodeURIComponent(userId)}`);
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    bio: user.bio,
    following: user.following,
    followers: user.followers,
    postCount: user.post_count,
    savedCount: user.saved_count,
    likedPostIds: user.liked_post_ids,
    savedPostIds: user.saved_post_ids,
    notInterestedPostIds: user.not_interested_post_ids,
    followedBookIds: user.followed_book_ids,
    posts: user.posts.map(mapFeedItem),
    savedPosts: user.saved_posts.map(mapFeedItem),
    likedPosts: user.liked_posts.map(mapFeedItem),
    recentEvents: user.recent_events.map(mapEvent),
  };
}

export const userService = { getUser };
