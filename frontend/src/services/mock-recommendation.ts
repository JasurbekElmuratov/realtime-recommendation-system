import { DEFAULT_INTERESTS, getBook, MOCK_BOOKS, MOCK_POSTS } from "@/data/mock-data";
import type {
  FeedItem,
  FeedResponse,
  InteractionEvent,
  Interest,
  RecommendationDebugSnapshot,
  RecommendationSignals,
} from "@/types";

const clamp = (value: number) => Math.max(0.05, Math.min(0.99, value));
const round = (value: number) => Math.round(value * 100) / 100;

function stableFraction(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return (hash % 100) / 100;
}

class MockRecommendationEngine {
  private interestWeights = new Map<string, number>();
  private authorWeights = new Map<string, number>();
  private query = "";
  private blockedPosts = new Set<string>();
  private revision = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.interestWeights.clear();
    this.authorWeights.clear();
    this.query = "";
    this.blockedPosts.clear();
    this.revision = 0;
    this.setInterests([...DEFAULT_INTERESTS]);
  }

  setInterests(interests: Interest[]) {
    this.interestWeights.clear();
    interests.forEach((interest) => this.interestWeights.set(interest, 1));
    this.revision += 1;
  }

  ingest(event: InteractionEvent) {
    if (event.eventType === "search" && event.query) {
      this.query = event.query.toLowerCase().trim();
      for (const book of MOCK_BOOKS) {
        const searchable = `${book.title} ${book.author} ${book.genres.join(" ")}`.toLowerCase();
        if (searchable.includes(this.query)) {
          this.authorWeights.set(book.author, (this.authorWeights.get(book.author) ?? 0) + 1.6);
          book.genres.forEach((genre) =>
            this.interestWeights.set(genre, (this.interestWeights.get(genre) ?? 0) + 0.7),
          );
        }
      }
    }

    if (event.bookId) {
      const book = getBook(event.bookId);
      const baseBoost = {
        like: 0.65,
        save: 0.9,
        book_open: 0.35,
        follow_author: 1.1,
        post_click: 0.15,
        comment: 0.3,
        impression: 0,
        search: 0,
        not_interested: -0.8,
      }[event.eventType];
      const boost = event.active === false && (event.eventType === "like" || event.eventType === "save")
        ? -baseBoost
        : baseBoost;

      this.authorWeights.set(book.author, (this.authorWeights.get(book.author) ?? 0) + boost);
      book.genres.forEach((genre) =>
        this.interestWeights.set(genre, Math.max(0, (this.interestWeights.get(genre) ?? 0) + boost / 2)),
      );
    }

    if (event.eventType === "not_interested" && event.postId) {
      this.blockedPosts.add(event.postId);
    }
    this.revision += 1;
  }

  private signalsFor(postId: string): RecommendationSignals {
    const post = MOCK_POSTS.find((item) => item.id === postId)!;
    const book = getBook(post.bookId);
    const genreWeight = Math.max(...book.genres.map((genre) => this.interestWeights.get(genre) ?? 0));
    const authorWeight = this.authorWeights.get(book.author) ?? 0;
    const queryMatch = this.query.length > 1 && `${book.title} ${book.author}`.toLowerCase().includes(this.query);
    const base = stableFraction(post.id) * 0.12;
    const semanticSimilarity = clamp(0.36 + base + genreWeight * 0.1 + authorWeight * 0.08 + (queryMatch ? 0.28 : 0));
    const categoryInterest = clamp(0.3 + genreWeight * 0.16);
    const authorAffinity = clamp(0.2 + authorWeight * 0.18 + (queryMatch ? 0.24 : 0));
    const freshness = clamp(0.52 + stableFraction(`${post.id}-fresh`) * 0.42);
    const popularity = clamp(0.35 + Math.log10(post.likes + post.comments + 10) / 5);
    const finalScore = clamp(
      semanticSimilarity * 0.55 +
        categoryInterest * 0.15 +
        authorAffinity * 0.1 +
        freshness * 0.1 +
        popularity * 0.1,
    );

    const reason = queryMatch
      ? `Your recent search strongly matches ${book.author}.`
      : authorWeight > 0.5
        ? `Recent activity increased your affinity for ${book.author}.`
        : `This overlaps with your interest in ${book.genres[0]}.`;

    return {
      semanticSimilarity: round(semanticSimilarity),
      categoryInterest: round(categoryInterest),
      authorAffinity: round(authorAffinity),
      freshness: round(freshness),
      popularity: round(popularity),
      finalScore: round(finalScore),
      reason,
      modelVersion: `mock-ranker-r${this.revision}`,
    };
  }

  getFeed(limit = 7): FeedResponse {
    const ranked = MOCK_POSTS.filter((post) => !this.blockedPosts.has(post.id))
      .map((post) => ({ post, book: getBook(post.bookId), signals: this.signalsFor(post.id) }))
      .sort((left, right) => right.signals.finalScore - left.signals.finalScore);

    const items: FeedItem[] = ranked.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
    const debug: RecommendationDebugSnapshot = {
      generatedAt: new Date().toISOString(),
      profile: [...this.interestWeights.entries()]
        .map(([interest, weight]) => ({ interest, weight: round(weight) }))
        .sort((a, b) => b.weight - a.weight),
      candidateGenerationCount: 48 + this.revision,
      retrievedCandidateCount: ranked.length,
      rankedCandidateCount: ranked.length,
      finalRecommendationIds: items.map((item) => item.post.id),
      candidates: ranked.map((item, index) => ({
        postId: item.post.id,
        bookTitle: item.book.title,
        source: index < 5 ? "direct-interest" : index < 8 ? "genre-expansion" : "popular-fallback",
        similarity: item.signals.semanticSimilarity,
        finalScore: item.signals.finalScore,
        selected: index < limit,
      })),
      latency: {
        profileMs: 4 + (this.revision % 3),
        retrievalMs: 27 + (this.revision % 7),
        rankingMs: 8 + (this.revision % 4),
        totalMs: 42 + (this.revision % 10),
      },
    };
    return { items, debug };
  }
}

export const mockRecommendationEngine = new MockRecommendationEngine();
