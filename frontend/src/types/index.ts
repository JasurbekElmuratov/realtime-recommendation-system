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
  | "book_open"
  | "like"
  | "save"
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
}

export interface Book {
  id: string;
  title: string;
  author: string;
  genres: Interest[];
  description: string;
  year: number;
  coverColor: string;
  coverTextColor: string;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  handle: string;
  avatarColor: string;
  bookId: string;
  text: string;
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
}

export type FeedStatus = "idle" | "loading" | "refreshing" | "ready" | "error";
