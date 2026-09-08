import { apiFetch, getSessionId } from "@/services/api";
import type {
  EventContext,
  FeedItem,
  InteractionEvent,
  InteractionEventType,
} from "@/types";

interface EventDetails extends EventContext {
  postId?: string;
  bookId?: string;
  query?: string;
  active?: boolean;
  dwellTimeMs?: number;
  postWordCount?: number;
  expectedReadingTimeMs?: number;
  readingRatio?: number;
}

type EventListener = (event: InteractionEvent) => void;
const STORAGE_KEY = "bookfeed.interactions.v4";
const PENDING_KEY = "bookfeed.pending-events.v3";
const MAX_STORED_EVENTS = 2500;
const listeners = new Set<EventListener>();
const impressed = new Set<string>();
let recentEvents: InteractionEvent[] = [];
let pendingEvents: InteractionEvent[] = [];
let hydrated = false;

// One queue preserves action order: a like must reach the API before an unlike.
let deliveryQueue = Promise.resolve();

function readEvents(key: string): InteractionEvent[] {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

function saveEvents() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recentEvents));
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(pendingEvents));
  } catch {
    // The current page still works when browser storage is full or unavailable.
  }
}

function notifyListeners(event: InteractionEvent) {
  for (const listener of listeners) listener(event);
}

async function sendEvent(event: InteractionEvent) {
  try {
    await apiFetch("/events", {
      method: "POST",
      body: JSON.stringify({
        event_id: event.id,
        user_id: event.userId,
        event_type: event.eventType,
        post_id: event.postId,
        book_id: event.bookId,
        query: event.query,
        timestamp: event.timestamp,
        session_id: event.sessionId,
        feed_request_id: event.feedRequestId,
        rank_position: event.rankPosition,
        recommendation_score: event.recommendationScore,
        dwell_time_ms: event.dwellTimeMs,
        post_word_count: event.postWordCount,
        expected_reading_time_ms: event.expectedReadingTimeMs,
        reading_ratio: event.readingRatio,
      }),
    });
    event.syncStatus = "synced";
    pendingEvents = pendingEvents.filter((pending) => pending.id !== event.id);
  } catch (error) {
    event.syncStatus = "failed";
    if (!pendingEvents.some((pending) => pending.id === event.id)) {
      pendingEvents = [event, ...pendingEvents].slice(0, MAX_STORED_EVENTS);
    }
    throw error;
  } finally {
    recentEvents = recentEvents.map((recent) =>
      recent.id === event.id ? event : recent,
    );
    saveEvents();
    notifyListeners(event);
  }
}

async function retryPendingEvents() {
  // Stored events are newest first; replay them in the original action order.
  for (const event of [...pendingEvents].reverse()) {
    try {
      await sendEvent(event);
    } catch {
      break;
    }
  }
}

function hydrate() {
  if (!hydrated) {
    hydrated = true;
    recentEvents = readEvents(STORAGE_KEY);
    pendingEvents = readEvents(PENDING_KEY);
    deliveryQueue = retryPendingEvents();
  }
  return [...recentEvents];
}

function record(
  userId: string,
  eventType: InteractionEventType,
  details: EventDetails = {},
) {
  hydrate();
  const event: InteractionEvent = {
    id: `event_${crypto.randomUUID()}`,
    userId,
    eventType,
    ...details,
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    syncStatus: "pending",
  };
  recentEvents = [event, ...recentEvents].slice(0, MAX_STORED_EVENTS);
  saveEvents();
  notifyListeners(event);

  const request = deliveryQueue.then(() => sendEvent(event));
  // A failed request stays in local storage and must not stop later requests.
  deliveryQueue = request.catch(() => undefined);
  return request;
}

function recordImpression(userId: string, item: FeedItem) {
  const key = `${getSessionId()}:${item.feedRequestId}:${item.post.id}`;
  if (impressed.has(key)) return Promise.resolve();
  impressed.add(key);
  return record(userId, "impression", {
    postId: item.post.id,
    bookId: item.book.id,
    feedRequestId: item.feedRequestId,
    rankPosition: item.rank,
    recommendationScore: item.signals.finalScore,
  });
}

function subscribe(listener: EventListener) {
  listeners.add(listener);
  return function unsubscribe() {
    listeners.delete(listener);
  };
}

export const eventService = {
  hydrate,
  record,
  recordImpression,
  subscribe,
  recent() {
    return [...recentEvents];
  },
  async whenIdle() {
    await deliveryQueue;
  },
};
