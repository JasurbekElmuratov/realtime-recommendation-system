import { apiFetch, getSessionId } from "@/services/api";
import type {
  ApiBook,
  ApiDebug,
  ApiFeedItem,
  ApiFeedResponse,
} from "@/services/contracts";
import type {
  Book,
  CandidateDebugRow,
  FeedItem,
  FeedResponse,
  RecommendationDebugSnapshot,
  SearchResponse,
} from "@/types";

export function mapBook(book: ApiBook): Book {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    genres: book.genres,
    description: book.description,
    year: book.year,
    coverUrl: book.cover_url,
  };
}

export function mapFeedItem(item: ApiFeedItem): FeedItem {
  const post = item.post;
  const signals = item.signals;
  return {
    post: {
      id: post.id,
      userId: post.user_id,
      username: post.username,
      handle: post.handle,
      avatarColor: post.avatar_color,
      bookId: post.book_id,
      text: post.text,
      wordCount: post.word_count,
      createdAt: post.created_at,
      likes: post.likes,
      comments: post.comments,
      saves: post.saves,
      kind: post.kind,
    },
    book: mapBook(item.book),
    signals: {
      semanticSimilarity: signals.semantic_similarity,
      categoryInterest: signals.category_interest,
      authorAffinity: signals.author_affinity,
      freshness: signals.freshness,
      popularity: signals.popularity,
      finalScore: signals.final_score,
      reason: signals.reason,
      modelVersion: signals.model_version,
    },
    rank: item.rank,
    feedRequestId: item.feed_request_id,
  };
}

function mapDebug(debug: ApiDebug): RecommendationDebugSnapshot {
  const candidates: CandidateDebugRow[] = debug.candidates.map((candidate) => {
    let source: CandidateDebugRow["source"] = "direct-interest";
    if (candidate.source === "genre-expansion") source = "genre-expansion";
    if (candidate.source === "popular-fallback") source = "popular-fallback";
    return {
      postId: candidate.post_id,
      bookTitle: candidate.book_title,
      source,
      similarity: candidate.similarity,
      finalScore: candidate.final_score,
      selected: candidate.selected,
    };
  });

  return {
    generatedAt: debug.generated_at,
    retrievalMode: debug.retrieval_mode,
    profile: debug.profile,
    candidateGenerationCount: debug.candidate_generation_count,
    retrievedCandidateCount: debug.retrieved_candidate_count,
    rankedCandidateCount: debug.ranked_candidate_count,
    finalRecommendationIds: debug.final_recommendation_ids,
    candidates,
    latency: {
      profileMs: debug.latency.profile_ms,
      retrievalMs: debug.latency.retrieval_ms,
      rankingMs: debug.latency.ranking_ms,
      totalMs: debug.latency.total_ms,
    },
  };
}

async function getFeed(
  userId: string,
  cursor?: string | null,
  limit = 10,
): Promise<FeedResponse> {
  const parameters = new URLSearchParams({
    limit: String(limit),
    session_id: getSessionId(),
  });
  if (cursor) parameters.set("cursor", cursor);

  const result = await apiFetch<ApiFeedResponse>(
    `/feed/${encodeURIComponent(userId)}?${parameters}`,
  );
  return {
    items: result.posts.map(mapFeedItem),
    debug: mapDebug(result.debug),
    nextCursor: result.next_cursor,
    hasMore: result.has_more,
    feedRequestId: result.feed_request_id,
  };
}

async function search(userId: string, query: string): Promise<SearchResponse> {
  const parameters = new URLSearchParams({
    user_id: userId,
    session_id: getSessionId(),
    q: query,
    limit: "12",
  });
  const result = await apiFetch<{
    posts: ApiFeedItem[];
    books: ApiBook[];
    feed_request_id: string;
  }>(`/search?${parameters}`);
  return {
    posts: result.posts.map(mapFeedItem),
    books: result.books.map(mapBook),
    feedRequestId: result.feed_request_id,
  };
}

async function getBooks(query = "", limit = 350): Promise<Book[]> {
  const parameters = new URLSearchParams({ q: query, limit: String(limit) });
  const result = await apiFetch<{ books: ApiBook[] }>(`/books?${parameters}`);
  return result.books.map(mapBook);
}

async function createPost(
  userId: string,
  bookId: string,
  text: string,
): Promise<FeedItem> {
  const result = await apiFetch<ApiFeedItem>("/posts", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, book_id: bookId, text }),
  });
  return mapFeedItem(result);
}

async function getPost(postId: string): Promise<FeedItem> {
  const result = await apiFetch<ApiFeedItem>(
    `/posts/${encodeURIComponent(postId)}`,
  );
  return mapFeedItem(result);
}

export const feedService = { getFeed, search, getBooks, createPost, getPost };

export const API_ROUTES = {
  events: "POST /events",
  posts: "POST /posts",
  post: "GET /posts/{post_id}",
  feed: "GET /feed/{user_id}",
  search: "GET /search",
  user: "GET /users/{user_id}",
  debug: "GET /recommendations/{user_id}/debug",
} as const;
