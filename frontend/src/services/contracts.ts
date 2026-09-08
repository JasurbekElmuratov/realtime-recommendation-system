// FastAPI sends snake_case names. These types describe its JSON responses.
// The service files translate them to the camelCase names used by React.
import type { InteractionEventType, Post } from "@/types";

export interface ApiBook {
  id: string;
  title: string;
  author: string;
  genres: string[];
  description: string;
  year: number | null;
  cover_url: string;
}

export interface ApiPost {
  id: string;
  user_id: string;
  username: string;
  handle: string;
  avatar_color: string;
  book_id: string;
  text: string;
  word_count: number;
  created_at: string;
  likes: number;
  comments: number;
  saves: number;
  kind: Post["kind"];
}

export interface ApiFeedItem {
  post: ApiPost;
  book: ApiBook;
  signals: {
    semantic_similarity: number;
    category_interest: number;
    author_affinity: number;
    freshness: number;
    popularity: number;
    final_score: number;
    reason: string;
    model_version: string;
  };
  rank: number;
  feed_request_id: string;
}

export interface ApiDebug {
  generated_at: string;
  retrieval_mode: string;
  profile: Array<{ interest: string; weight: number }>;
  candidate_generation_count: number;
  retrieved_candidate_count: number;
  ranked_candidate_count: number;
  final_recommendation_ids: string[];
  candidates: Array<{
    post_id: string;
    book_title: string;
    source: string;
    similarity: number;
    final_score: number;
    selected: boolean;
  }>;
  latency: {
    profile_ms: number;
    retrieval_ms: number;
    ranking_ms: number;
    total_ms: number;
  };
}

export interface ApiFeedResponse {
  posts: ApiFeedItem[];
  next_cursor: string | null;
  has_more: boolean;
  feed_request_id: string;
  debug: ApiDebug;
}

// Recent events come from CSV, so their numeric values are strings.
export interface ApiEvent {
  event_id: string;
  user_id: string;
  event_type: InteractionEventType;
  post_id: string;
  book_id: string;
  query: string;
  timestamp: string;
  session_id: string;
  feed_request_id: string;
  rank_position: string;
  recommendation_score: string;
  dwell_time_ms: string;
  post_word_count: string;
  expected_reading_time_ms: string;
  reading_ratio: string;
}

export interface ApiUser {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  following: number;
  followers: number;
  post_count: number;
  saved_count: number;
  liked_post_ids: string[];
  saved_post_ids: string[];
  not_interested_post_ids: string[];
  followed_book_ids: string[];
  posts: ApiFeedItem[];
  saved_posts: ApiFeedItem[];
  liked_posts: ApiFeedItem[];
  recent_events: ApiEvent[];
}
