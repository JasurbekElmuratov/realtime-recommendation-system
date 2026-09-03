import { mockRecommendationEngine } from "@/services/mock-recommendation";
import type { InteractionEvent, InteractionEventType } from "@/types";

type EventListener = (event: InteractionEvent) => void;
const STORAGE_KEY = "bookfeed.interactions.v1";
const MAX_STORED_EVENTS = 2500;
const listeners = new Set<EventListener>();
const recentEvents: InteractionEvent[] = [];
let hydrated = false;

function isInteractionEvent(value: unknown): value is InteractionEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<InteractionEvent>;
  return typeof event.id === "string" && typeof event.userId === "string" && typeof event.eventType === "string" && typeof event.timestamp === "string";
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recentEvents));
  } catch {
    // Local storage can be unavailable in private or locked-down browser contexts.
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return [...recentEvents];
  hydrated = true;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    const stored = Array.isArray(parsed) ? parsed.filter(isInteractionEvent).slice(0, MAX_STORED_EVENTS) : [];
    recentEvents.splice(0, recentEvents.length, ...stored);
    mockRecommendationEngine.reset();
    [...stored].reverse().forEach((event) => mockRecommendationEngine.ingest(event));
  } catch {
    recentEvents.splice(0);
    mockRecommendationEngine.reset();
  }
  return [...recentEvents];
}

function emit(
  userId: string,
  eventType: InteractionEventType,
  details: Pick<InteractionEvent, "postId" | "bookId" | "query" | "active"> = {},
) {
  hydrate();
  const event: InteractionEvent = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    userId,
    eventType,
    ...details,
    timestamp: new Date().toISOString(),
  };
  recentEvents.unshift(event);
  recentEvents.splice(MAX_STORED_EVENTS);
  mockRecommendationEngine.ingest(event);
  persist();
  listeners.forEach((listener) => listener(event));
  return event;
}

export const eventService = {
  hydrate,
  subscribe(listener: EventListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  recent() {
    return [...recentEvents];
  },
  trackImpression: (userId: string, postId: string, bookId: string) =>
    emit(userId, "impression", { postId, bookId }),
  trackPostOpen: (userId: string, postId: string, bookId: string) =>
    emit(userId, "post_click", { postId, bookId }),
  trackBookOpen: (userId: string, bookId: string) => emit(userId, "book_open", { bookId }),
  trackLike: (userId: string, postId: string, bookId: string, active = true) =>
    emit(userId, "like", { postId, bookId, active }),
  trackSave: (userId: string, postId: string, bookId: string, active = true) =>
    emit(userId, "save", { postId, bookId, active }),
  trackComment: (userId: string, postId: string, bookId: string) =>
    emit(userId, "comment", { postId, bookId }),
  trackSearch: (userId: string, query: string) => emit(userId, "search", { query }),
  trackFollowAuthor: (userId: string, bookId: string) => emit(userId, "follow_author", { bookId }),
  trackNotInterested: (userId: string, postId: string, bookId: string) =>
    emit(userId, "not_interested", { postId, bookId }),
};
