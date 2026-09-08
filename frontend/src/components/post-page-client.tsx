"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PostDetail } from "@/components/post-detail";
import { feedService } from "@/services/feed";
import type { FeedItem } from "@/types";

export function PostPageClient({ postId }: { postId: string }) {
  const router = useRouter();
  const [item, setItem] = useState<FeedItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadPost() {
      try {
        const next = await feedService.getPost(postId);
        if (!cancelled) setItem(next);
      } catch {
        if (!cancelled)
          setError("This post could not be loaded from the BookFeed API.");
      }
    }
    void loadPost();
    return () => {
      cancelled = true;
    };
  }, [attempt, postId]);

  if (error)
    return (
      <div className="grid min-h-[70vh] place-items-center p-6">
        <div className="max-w-sm text-center">
          <h1 className="font-serif text-2xl font-semibold">
            Post unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{error}</p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm font-semibold"
              onClick={() => router.back()}
            >
              Back
            </button>
            <button
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setError(null);
                setItem(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  if (!item)
    return (
      <div className="animate-pulse p-6 sm:p-8" aria-label="Loading post">
        <div className="h-6 w-24 rounded bg-[var(--soft)]" />
        <div className="mt-10 h-12 w-12 rounded-full bg-[var(--soft)]" />
        <div className="mt-8 h-5 w-full rounded bg-[var(--soft)]" />
        <div className="mt-3 h-5 w-4/5 rounded bg-[var(--soft)]" />
        <div className="mt-10 h-36 rounded-2xl bg-[var(--soft)]" />
      </div>
    );
  return <PostDetail item={item} />;
}
