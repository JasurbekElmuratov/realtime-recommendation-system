"use client";

import { useEffect } from "react";

import { EmptyState, ErrorState, FeedSkeleton } from "@/components/feed-states";
import { PostCard } from "@/components/post-card";
import { useBookFeed } from "@/providers/bookfeed-provider";
import { eventService } from "@/services/events";

export function Feed({ limit }: { limit?: number }) {
  const { feed, status, error, refreshFeed, user } = useBookFeed();

  useEffect(() => {
    if (status !== "ready") return;
    feed.forEach((item) => eventService.trackImpression(user.id, item.post.id, item.book.id));
  }, [feed, status, user.id]);

  if (status === "loading") return <FeedSkeleton />;
  if (status === "error") return <ErrorState message={error ?? undefined} onRetry={refreshFeed} />;
  if (!feed.length) return <EmptyState title="Your feed is quiet" description="Choose more interests or explore books to shape your recommendations." actionHref="/explore" actionLabel="Explore books" />;

  return (
    <div className="relative space-y-3">
      {status === "refreshing" && <div className="sticky top-14 z-10 h-1 overflow-hidden bg-[var(--soft)] lg:top-0"><div className="refresh-bar h-full w-1/3 bg-[var(--accent)]" /></div>}
      {feed.slice(0, limit).map((item) => <PostCard key={item.post.id} item={item} />)}
    </div>
  );
}
