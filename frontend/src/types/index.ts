export const INTERESTS = [
  "Classics",
  "Philosophy",
  "Science Fiction",
  "Fantasy",
  "Psychology",
  "History",
  "AI/Technology",
  "Business",
] as const;

export type Interest = (typeof INTERESTS)[number];

export type InteractionEventType =
  | "impression"
  | "post_click"
  | "post_dwell"
  | "book_open"
  | "like"
  | "unlike"
  | "save"
  | "unsave"
  | "comment"
  | "search"
  | "follow_author"
  | "not_interested";

export interface InteractionEvent {
  id: string;
  userId: string;
  eventType: InteractionEventType;
  postId?: string;
  bookId?: string;
  query?: string;
  active?: boolean;
  timestamp: string;
  sessionId: string;
  feedRequestId?: string;
  rankPosition?: number;
  recommendationScore?: number;
  dwellTimeMs?: number;
  postWordCount?: number;
  expectedReadingTimeMs?: number;
  readingRatio?: number;
  syncStatus?: "pending" | "synced" | "failed";
}

export interface Book {
  id: string;
  title: string;
  author: string;
  genres: string[];
  description: string;
  year?: number | null;
  coverUrl?: string;
  coverColor?: string;
  coverTextColor?: string;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  handle: string;
  avatarColor: string;
  bookId: string;
  text: string;
  wordCount: number;
  createdAt: string;
  likes: number;
  comments: number;
  saves: number;
  kind: "review" | "discussion" | "recommendation";
}

export interface RecommendationSignals {
  semanticSimilarity: number;
  categoryInterest: number;
  authorAffinity: number;
  freshness: number;
  popularity: number;
  finalScore: number;
  reason: string;
  modelVersion: string;
}

export interface FeedItem {
  post: Post;
  book: Book;
  signals: RecommendationSignals;
  rank: number;
  feedRequestId: string;
}

export interface CandidateDebugRow {
  postId: string;
  bookTitle: string;
  source: "direct-interest" | "genre-expansion" | "popular-fallback";
  similarity: number;
  finalScore: number;
  selected: boolean;
}

export interface RecommendationDebugSnapshot {
  generatedAt: string;
  retrievalMode: string;
  profile: Array<{ interest: string; weight: number }>;
  candidateGenerationCount: number;
  retrievedCandidateCount: number;
  rankedCandidateCount: number;
  finalRecommendationIds: string[];
  candidates: CandidateDebugRow[];
  latency: {
    profileMs: number;
    retrievalMs: number;
    rankingMs: number;
    totalMs: number;
  };
}

export interface FeedResponse {
  items: FeedItem[];
  debug: RecommendationDebugSnapshot;
  nextCursor: string | null;
  hasMore: boolean;
  feedRequestId: string;
}

export interface BookFeedUser {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  following: number;
  followers: number;
  postCount: number;
  savedCount: number;
  likedPostIds: string[];
  savedPostIds: string[];
  notInterestedPostIds: string[];
  followedBookIds: string[];
  posts: FeedItem[];
  savedPosts: FeedItem[];
  likedPosts: FeedItem[];
  recentEvents: InteractionEvent[];
}

export interface SearchResponse {
  posts: FeedItem[];
  books: Book[];
  feedRequestId: string;
}

export interface EventContext {
  feedRequestId?: string;
  rankPosition?: number;
  recommendationScore?: number;
}

export type FeedStatus = "idle" | "loading" | "refreshing" | "ready" | "error";
