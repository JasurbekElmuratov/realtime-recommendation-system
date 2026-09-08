"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import { DEMO_USER_ID } from "@/services/api";
import { eventService } from "@/services/events";
import { feedService } from "@/services/feed";
import { userService } from "@/services/users";
import type {
  Book,
  BookFeedUser,
  EventContext,
  FeedItem,
  FeedResponse,
  FeedStatus,
  InteractionEvent,
  Interest,
  RecommendationDebugSnapshot,
} from "@/types";

const EMPTY_USER: BookFeedUser = {
  id: DEMO_USER_ID,
  username: "bookfeed_reader",
  displayName: "BookFeed Reader",
  bio: "A new BookFeed reader. This profile grows from activity in the app.",
  following: 0,
  followers: 0,
  postCount: 0,
  savedCount: 0,
  likedPostIds: [],
  savedPostIds: [],
  notInterestedPostIds: [],
  followedBookIds: [],
  posts: [],
  savedPosts: [],
  likedPosts: [],
  recentEvents: [],
};

interface BookFeedContextValue {
  user: BookFeedUser;
  feed: FeedItem[];
  profileItems: FeedItem[];
  catalogBooks: Book[];
  status: FeedStatus;
  error: string | null;
  interactionError: string | null;
  debug: RecommendationDebugSnapshot | null;
  recentEvents: InteractionEvent[];
  interests: Interest[];
  likedPostIds: Set<string>;
  savedPostIds: Set<string>;
  savedItems: FeedItem[];
  likedItems: FeedItem[];
  followedAuthors: Set<string>;
  createdPosts: FeedItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  refreshFeed: () => Promise<void>;
  loadMore: () => Promise<void>;
  recordImpression: (item: FeedItem) => void;
  likePost: (postId: string, bookId: string) => void;
  savePost: (postId: string, bookId: string) => void;
  commentOnPost: (postId: string, bookId: string) => void;
  openPost: (postId: string, bookId: string) => void;
  recordPostDwell: (
    postId: string,
    bookId: string,
    metrics: {
      dwellTimeMs: number;
      postWordCount: number;
      expectedReadingTimeMs: number;
      readingRatio: number;
    },
  ) => void;
  openBook: (bookId: string, postId?: string) => void;
  followAuthor: (bookId: string) => void;
  notInterested: (postId: string, bookId: string) => void;
  search: (query: string) => void;
  setInterests: (interests: Interest[]) => void;
  createPost: (bookId: string, text: string) => Promise<FeedItem>;
}

const BookFeedContext = createContext<BookFeedContextValue | null>(null);

// A post can appear in several API responses. Show it only once in each list.
function uniqueItems(items: FeedItem[]) {
  const result: FeedItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!seen.has(item.post.id)) {
      result.push(item);
      seen.add(item.post.id);
    }
  }
  return result;
}

function toggleId(ids: string[], id: string) {
  if (ids.includes(id)) return ids.filter((existingId) => existingId !== id);
  return [...ids, id];
}

export function BookFeedProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const initialized = useRef(false);
  const cursor = useRef<string | null>(null);
  const loadingMore = useRef(false);

  // State is shared by all pages. The backend remains the permanent data store.
  const [user, setUser] = useState(EMPTY_USER);
  const [feedResponse, setFeedResponse] = useState<FeedResponse | null>(null);
  const [catalogBooks, setCatalogBooks] = useState<Book[]>([]);
  const [createdPosts, setCreatedPosts] = useState<FeedItem[]>([]);
  const [interests, updateInterests] = useState<Interest[]>([]);
  const [recentEvents, setRecentEvents] = useState<InteractionEvent[]>([]);
  const [status, setStatus] = useState<FeedStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Derive these values from existing state instead of keeping duplicate copies.
  const feed = feedResponse?.items ?? [];
  const hasMore = feedResponse?.hasMore ?? false;
  const likedPostIds = new Set(user.likedPostIds);
  const savedPostIds = new Set(user.savedPostIds);
  const followedAuthors = new Set<string>();
  for (const book of catalogBooks) {
    if (user.followedBookIds.includes(book.id))
      followedAuthors.add(book.author);
  }

  const refreshFeed = useCallback(async function refreshFeed() {
    setStatus("refreshing");
    setError(null);
    try {
      // Wait so this feed includes the user's latest like, save, or search.
      await eventService.whenIdle();
      const response = await feedService.getFeed(DEMO_USER_ID);
      const nextUser = await userService.getUser(DEMO_USER_ID);
      setFeedResponse(response);
      setUser(nextUser);
      cursor.current = response.nextCursor;
      setStatus("ready");
    } catch {
      setError(
        "The FastAPI feed could not be loaded. Make sure it is running on port 8000.",
      );
      setStatus("error");
    }
  }, []);

  const loadMore = useCallback(
    async function loadMore() {
      if (!cursor.current || loadingMore.current || !hasMore) return;
      loadingMore.current = true;
      setIsLoadingMore(true);
      setLoadMoreError(null);
      try {
        await eventService.whenIdle();
        const response = await feedService.getFeed(
          DEMO_USER_ID,
          cursor.current,
        );
        setFeedResponse((current) => ({
          ...response,
          items: uniqueItems([...(current?.items ?? []), ...response.items]),
        }));
        cursor.current = response.nextCursor;
      } catch {
        setLoadMoreError("The next recommendations could not be loaded.");
      } finally {
        loadingMore.current = false;
        setIsLoadingMore(false);
      }
    },
    [hasMore],
  );

  // Load the first feed, user profile, and book catalog when the app opens.
  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      eventService.hydrate();
      await eventService.whenIdle();
      try {
        const [response, nextUser, books] = await Promise.all([
          feedService.getFeed(DEMO_USER_ID),
          userService.getUser(DEMO_USER_ID),
          feedService.getBooks(),
        ]);
        if (cancelled) return;
        setFeedResponse(response);
        setUser(nextUser);
        setCatalogBooks(books);
        const localEvents = eventService.recent();
        setRecentEvents(
          localEvents.length ? localEvents : nextUser.recentEvents,
        );
        cursor.current = response.nextCursor;
        setStatus("ready");
        initialized.current = true;
      } catch {
        if (cancelled) return;
        setError(
          "The FastAPI feed could not be loaded. Make sure it is running on port 8000.",
        );
        setStatus("error");
        initialized.current = true;
      }
    }
    // The cleanup cancels this startup during React's development remount.
    const timer = window.setTimeout(loadInitialData, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    return eventService.subscribe(() => setRecentEvents(eventService.recent()));
  }, []);

  // Returning to Home requests a fresh ranking. Clicking buttons never shuffles
  // posts that the reader is already looking at.
  useEffect(() => {
    const previous = previousPathname.current;
    previousPathname.current = pathname;
    if (!initialized.current || pathname !== "/home" || previous === "/home")
      return;
    const timer = window.setTimeout(refreshFeed, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, refreshFeed]);

  function findPost(postId: string) {
    const allPosts = [
      ...feed,
      ...user.savedPosts,
      ...user.likedPosts,
      ...createdPosts,
      ...user.posts,
    ];
    return allPosts.find((item) => item.post.id === postId);
  }

  function itemContext(postId: string): EventContext {
    const item = findPost(postId);
    if (!item) return {};
    return {
      feedRequestId: item.feedRequestId,
      rankPosition: item.rank,
      recommendationScore: item.signals.finalScore,
    };
  }

  async function handleEvent(request: Promise<void>) {
    try {
      await request;
      setInteractionError(null);
    } catch {
      setInteractionError(
        "The event is queued locally and will retry when the API is available.",
      );
    }
  }

  const recordImpression = useCallback(function recordImpression(
    item: FeedItem,
  ) {
    // Failed impressions are queued too, but should not interrupt reading.
    void eventService
      .recordImpression(DEMO_USER_ID, item)
      .catch(() => undefined);
  }, []);

  function likePost(postId: string, bookId: string) {
    const active = !likedPostIds.has(postId);
    const item = findPost(postId);
    setUser((current) => {
      let likedPosts = current.likedPosts;
      if (active && item) likedPosts = uniqueItems([item, ...likedPosts]);
      if (!active)
        likedPosts = likedPosts.filter((post) => post.post.id !== postId);
      return {
        ...current,
        likedPostIds: toggleId(current.likedPostIds, postId),
        likedPosts,
      };
    });
    void handleEvent(
      eventService.record(DEMO_USER_ID, active ? "like" : "unlike", {
        postId,
        bookId,
        active,
        ...itemContext(postId),
      }),
    );
  }

  function savePost(postId: string, bookId: string) {
    const active = !savedPostIds.has(postId);
    const item = findPost(postId);
    setUser((current) => {
      let savedPosts = current.savedPosts;
      if (active && item) savedPosts = uniqueItems([item, ...savedPosts]);
      if (!active)
        savedPosts = savedPosts.filter((post) => post.post.id !== postId);
      return {
        ...current,
        savedPostIds: toggleId(current.savedPostIds, postId),
        savedPosts,
      };
    });
    void handleEvent(
      eventService.record(DEMO_USER_ID, active ? "save" : "unsave", {
        postId,
        bookId,
        active,
        ...itemContext(postId),
      }),
    );
  }

  function commentOnPost(postId: string, bookId: string) {
    void handleEvent(
      eventService.record(DEMO_USER_ID, "comment", {
        postId,
        bookId,
        ...itemContext(postId),
      }),
    );
  }

  function openPost(postId: string, bookId: string) {
    void handleEvent(
      eventService.record(DEMO_USER_ID, "post_click", {
        postId,
        bookId,
        ...itemContext(postId),
      }),
    );
  }

  function recordPostDwell(
    postId: string,
    bookId: string,
    metrics: {
      dwellTimeMs: number;
      postWordCount: number;
      expectedReadingTimeMs: number;
      readingRatio: number;
    },
  ) {
    void handleEvent(
      eventService.record(DEMO_USER_ID, "post_dwell", {
        postId,
        bookId,
        ...metrics,
        ...itemContext(postId),
      }),
    );
  }

  function openBook(bookId: string, postId?: string) {
    const context = postId ? itemContext(postId) : {};
    void handleEvent(
      eventService.record(DEMO_USER_ID, "book_open", { bookId, ...context }),
    );
  }

  function followAuthor(bookId: string) {
    setUser((current) => ({
      ...current,
      followedBookIds: [...current.followedBookIds, bookId],
    }));
    void handleEvent(
      eventService.record(DEMO_USER_ID, "follow_author", { bookId }),
    );
  }

  function notInterested(postId: string, bookId: string) {
    setFeedResponse((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.filter((item) => item.post.id !== postId),
      };
    });
    void handleEvent(
      eventService.record(DEMO_USER_ID, "not_interested", {
        postId,
        bookId,
        ...itemContext(postId),
      }),
    );
  }

  function search(query: string) {
    void handleEvent(eventService.record(DEMO_USER_ID, "search", { query }));
  }

  function setInterests(next: Interest[]) {
    updateInterests(next);
    for (const interest of next) search(interest);
  }

  async function createPost(bookId: string, text: string) {
    const item = await feedService.createPost(DEMO_USER_ID, bookId, text);
    setCreatedPosts((current) => uniqueItems([item, ...current]));
    return item;
  }

  const value: BookFeedContextValue = {
    user,
    feed,
    profileItems: uniqueItems([...createdPosts, ...user.posts]),
    catalogBooks,
    status,
    error,
    interactionError,
    debug: feedResponse?.debug ?? null,
    recentEvents,
    interests,
    likedPostIds,
    savedPostIds,
    savedItems: user.savedPosts,
    likedItems: user.likedPosts,
    followedAuthors,
    createdPosts,
    hasMore,
    isLoadingMore,
    loadMoreError,
    refreshFeed,
    loadMore,
    recordImpression,
    likePost,
    savePost,
    commentOnPost,
    openPost,
    recordPostDwell,
    openBook,
    followAuthor,
    notInterested,
    search,
    setInterests,
    createPost,
  };
  return (
    <BookFeedContext.Provider value={value}>
      {children}
    </BookFeedContext.Provider>
  );
}

export function useBookFeed() {
  const value = useContext(BookFeedContext);
  if (!value)
    throw new Error("useBookFeed must be used inside BookFeedProvider");
  return value;
}
