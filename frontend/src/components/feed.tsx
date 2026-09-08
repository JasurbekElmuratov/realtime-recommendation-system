"use client";

import { useEffect, useRef } from "react";

import { EmptyState, ErrorState, FeedSkeleton } from "@/components/feed-states";
import { PostCard } from "@/components/post-card";
import { useBookFeed } from "@/providers/bookfeed-provider";
import type { FeedItem } from "@/types";

function VisiblePost({ item }: { item: FeedItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const { recordImpression } = useBookFeed();
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let timer: number | null = null;
    // Count a view only after at least half the post is visible for 550 ms.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (timer !== null) window.clearTimeout(timer);
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          timer = window.setTimeout(() => recordImpression(item), 550);
        } else if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [item, recordImpression]);
  return (
    <div ref={ref}>
      <PostCard item={item} />
    </div>
  );
}

export function Feed({ limit }: { limit?: number }) {
  const {
    feed,
    status,
    error,
    refreshFeed,
    loadMore,
    hasMore,
    isLoadingMore,
    loadMoreError,
  } = useBookFeed();
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || limit) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [limit, loadMore, status]);

  if (status === "loading") return <FeedSkeleton />;
  if (status === "error")
    return <ErrorState message={error ?? undefined} onRetry={refreshFeed} />;
  if (!feed.length)
    return (
      <EmptyState
        title="Your feed is quiet"
        description="Choose more interests or explore books to shape your recommendations."
        actionHref="/explore"
        actionLabel="Explore books"
      />
    );

  return (
    <div className="relative space-y-3">
      {status === "refreshing" && (
        <div className="sticky top-14 z-10 h-1 overflow-hidden bg-[var(--soft)] lg:top-0">
          <div className="refresh-bar h-full w-1/3 bg-[var(--accent)]" />
        </div>
      )}
      {feed.slice(0, limit).map((item) => (
        <VisiblePost key={item.post.id} item={item} />
      ))}
      {!limit && (
        <div
          ref={sentinel}
          className="min-h-12 py-3 text-center text-sm text-[var(--muted)]"
        >
          {isLoadingMore && (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)]" />
              Loading more recommendations…
            </span>
          )}
          {loadMoreError && (
            <button
              onClick={() => void loadMore()}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-[var(--accent)]"
            >
              Retry
            </button>
          )}
          {!hasMore && !isLoadingMore && !loadMoreError && (
            <span>You’re all caught up.</span>
          )}
        </div>
      )}
    </div>
  );
}
