import { mockRecommendationEngine } from "@/services/mock-recommendation";
import type { FeedItem, FeedResponse } from "@/types";

export interface FeedService {
  getFeed(userId: string): Promise<FeedResponse>;
  refreshFeed(userId: string): Promise<FeedResponse>;
  getItemsByPostIds(userId: string, postIds: string[]): Promise<FeedItem[]>;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class MockFeedService implements FeedService {
  async getFeed(userId: string) {
    void userId;
    await wait(260);
    return mockRecommendationEngine.getFeed();
  }

  async refreshFeed(userId: string) {
    void userId;
    await wait(360);
    return mockRecommendationEngine.getFeed();
  }

  async getItemsByPostIds(userId: string, postIds: string[]) {
    void userId;
    const wanted = new Set(postIds);
    return mockRecommendationEngine.getFeed(100).items.filter((item) => wanted.has(item.post.id));
  }
}

export const feedService: FeedService = new MockFeedService();

export const FUTURE_API_ROUTES = {
  events: "POST /events",
  feed: "GET /feed/{user_id}",
  recommendations: "GET /recommendations/{user_id}",
  debug: "GET /debug/users/{user_id}",
} as const;
