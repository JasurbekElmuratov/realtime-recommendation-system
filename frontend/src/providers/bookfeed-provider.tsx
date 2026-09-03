"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { DEFAULT_INTERESTS, DEMO_USER, getBook } from "@/data/mock-data";
import { eventService } from "@/services/events";
import { feedService } from "@/services/feed";
import { mockRecommendationEngine } from "@/services/mock-recommendation";
import type { FeedItem, FeedStatus, InteractionEvent, Interest, Post, RecommendationDebugSnapshot } from "@/types";

interface BookFeedContextValue {
  user: typeof DEMO_USER;
  feed: FeedItem[];
  status: FeedStatus;
  error: string | null;
  debug: RecommendationDebugSnapshot | null;
  recentEvents: InteractionEvent[];
  pendingInteractionCount: number;
  interests: Interest[];
  likedPostIds: Set<string>;
  savedPostIds: Set<string>;
  savedItems: FeedItem[];
  followedAuthors: Set<string>;
  createdPosts: Post[];
  refreshFeed: () => Promise<void>;
  likePost: (postId: string, bookId: string) => void;
  savePost: (postId: string, bookId: string) => void;
  commentOnPost: (postId: string, bookId: string) => void;
  openPost: (postId: string, bookId: string) => void;
  openBook: (bookId: string) => void;
  followAuthor: (bookId: string) => void;
  notInterested: (postId: string, bookId: string) => void;
  search: (query: string) => void;
  setInterests: (interests: Interest[]) => void;
  createPost: (bookId: string, text: string) => void;
}

const BookFeedContext = createContext<BookFeedContextValue | null>(null);

function restoreInteractionState(events: InteractionEvent[]) {
  const liked = new Set<string>();
  const saved = new Set<string>();
  const followed = new Set<string>();

  [...events].reverse().forEach((event) => {
    if (event.eventType === "like" && event.postId) {
      if (event.active === false) liked.delete(event.postId);
      else liked.add(event.postId);
    }
    if (event.eventType === "save" && event.postId) {
      if (event.active === false) saved.delete(event.postId);
      else saved.add(event.postId);
    }
    if (event.eventType === "follow_author" && event.bookId) followed.add(getBook(event.bookId).author);
  });

  return { liked, saved, followed };
}

export function BookFeedProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const initialized = useRef(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<FeedStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<RecommendationDebugSnapshot | null>(null);
  const [recentEvents, setRecentEvents] = useState<InteractionEvent[]>([]);
  const [pendingInteractionCount, setPendingInteractionCount] = useState(0);
  const [interests, updateInterests] = useState<Interest[]>([...DEFAULT_INTERESTS]);
  const [likedPostIds, setLikedPostIds] = useState(new Set<string>());
  const [savedPostIds, setSavedPostIds] = useState(new Set<string>());
  const [savedItems, setSavedItems] = useState<FeedItem[]>([]);
  const [followedAuthors, setFollowedAuthors] = useState(new Set<string>());
  const [createdPosts, setCreatedPosts] = useState<Post[]>([]);

  const loadFeed = useCallback(async (refresh = false) => {
    setStatus(refresh ? "refreshing" : "loading");
    setError(null);
    try {
      const response = refresh ? await feedService.refreshFeed(DEMO_USER.id) : await feedService.getFeed(DEMO_USER.id);
      setFeed(response.items);
      setDebug(response.debug);
      setPendingInteractionCount(0);
      setStatus("ready");
    } catch {
      setError("The feed could not be loaded. Please try again.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const events = eventService.hydrate();
      const restored = restoreInteractionState(events);
      setRecentEvents(events);
      setLikedPostIds(restored.liked);
      setSavedPostIds(restored.saved);
      setFollowedAuthors(restored.followed);

      feedService.getFeed(DEMO_USER.id).then(async (response) => {
        if (cancelled) return;
        setFeed(response.items);
        setDebug(response.debug);
        setSavedItems(await feedService.getItemsByPostIds(DEMO_USER.id, [...restored.saved]));
        setStatus("ready");
        initialized.current = true;
      }, () => {
        if (cancelled) return;
        setError("The feed could not be loaded. Please try again.");
        setStatus("error");
        initialized.current = true;
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => eventService.subscribe((event) => {
    setRecentEvents(eventService.recent());
    if (event.eventType !== "impression") setPendingInteractionCount((count) => count + 1);
  }), []);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    if (!initialized.current) return;
    const timer = window.setTimeout(() => { void loadFeed(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFeed, pathname]);

  const likePost = (postId: string, bookId: string) => {
    const active = !likedPostIds.has(postId);
    setLikedPostIds((current) => {
      const next = new Set(current);
      if (active) next.add(postId);
      else next.delete(postId);
      return next;
    });
    eventService.trackLike(DEMO_USER.id, postId, bookId, active);
  };

  const savePost = (postId: string, bookId: string) => {
    const active = !savedPostIds.has(postId);
    setSavedPostIds((current) => {
      const next = new Set(current);
      if (active) next.add(postId);
      else next.delete(postId);
      return next;
    });
    if (active) {
      const item = feed.find((candidate) => candidate.post.id === postId);
      if (item) setSavedItems((current) => [item, ...current.filter((saved) => saved.post.id !== postId)]);
    } else {
      setSavedItems((current) => current.filter((item) => item.post.id !== postId));
    }
    eventService.trackSave(DEMO_USER.id, postId, bookId, active);
  };

  const setInterests = (next: Interest[]) => {
    updateInterests(next);
    mockRecommendationEngine.setInterests(next);
    void loadFeed(true);
  };

  const followAuthor = (bookId: string) => {
    const author = getBook(bookId).author;
    setFollowedAuthors((current) => new Set(current).add(author));
    eventService.trackFollowAuthor(DEMO_USER.id, bookId);
  };

  const createPost = (bookId: string, text: string) => {
    setCreatedPosts((current) => [{
      id: `created-${Date.now()}`,
      userId: DEMO_USER.id,
      username: DEMO_USER.name,
      handle: DEMO_USER.handle,
      avatarColor: "#1f5c4a",
      bookId,
      text,
      createdAt: new Date().toISOString(),
      likes: 0,
      comments: 0,
      saves: 0,
      kind: "discussion",
    }, ...current]);
  };

  const value: BookFeedContextValue = {
    user: DEMO_USER,
    feed,
    status,
    error,
    debug,
    recentEvents,
    pendingInteractionCount,
    interests,
    likedPostIds,
    savedPostIds,
    savedItems,
    followedAuthors,
    createdPosts,
    refreshFeed: () => loadFeed(true),
    likePost,
    savePost,
    commentOnPost: (postId, bookId) => eventService.trackComment(DEMO_USER.id, postId, bookId),
    openPost: (postId, bookId) => eventService.trackPostOpen(DEMO_USER.id, postId, bookId),
    openBook: (bookId) => eventService.trackBookOpen(DEMO_USER.id, bookId),
    followAuthor,
    notInterested: (postId, bookId) => eventService.trackNotInterested(DEMO_USER.id, postId, bookId),
    search: (query) => eventService.trackSearch(DEMO_USER.id, query),
    setInterests,
    createPost,
  };

  return <BookFeedContext.Provider value={value}>{children}</BookFeedContext.Provider>;
}

export function useBookFeed() {
  const value = useContext(BookFeedContext);
  if (!value) throw new Error("useBookFeed must be used inside BookFeedProvider");
  return value;
}

