"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { BookCover } from "@/components/book-cover";
import { Icon } from "@/components/icons";
import { useBookFeed } from "@/providers/bookfeed-provider";
import type { FeedItem } from "@/types";

const READING_WORDS_PER_MINUTE = 225;
const MINIMUM_RECORDED_DWELL_MS = 2_000;
const MINIMUM_EXPECTED_READING_MS = 4_000;

export function PostDetail({ item }: { item: FeedItem }) {
  const router = useRouter();
  const {
    likedPostIds,
    savedPostIds,
    likePost,
    savePost,
    openPost,
    openBook,
    recordPostDwell,
  } = useBookFeed();
  const recordRef = useRef(recordPostDwell);
  const openedRef = useRef(false);
  const wordCount = Math.max(
    item.post.wordCount,
    item.post.text.trim().split(/\s+/).filter(Boolean).length,
    1,
  );
  const expectedReadingTimeMs = Math.max(
    MINIMUM_EXPECTED_READING_MS,
    Math.round((wordCount / READING_WORDS_PER_MINUTE) * 60_000),
  );

  useEffect(() => {
    recordRef.current = recordPostDwell;
  }, [recordPostDwell]);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    openPost(item.post.id, item.book.id);
  }, [item.book.id, item.post.id, openPost]);

  useEffect(() => {
    let elapsedMs = 0;
    let activeSince: number | null = null;

    function resume() {
      if (document.visibilityState === "visible" && activeSince === null) {
        activeSince = performance.now();
      }
    }

    function pause() {
      if (activeSince === null) return;
      elapsedMs += performance.now() - activeSince;
      activeSince = null;
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") resume();
      else pause();
    }

    // Time spent in a hidden browser tab is not reading time.
    resume();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      pause();
      document.removeEventListener("visibilitychange", handleVisibility);
      const dwellTimeMs = Math.round(elapsedMs);
      if (dwellTimeMs < MINIMUM_RECORDED_DWELL_MS) return;
      recordRef.current(item.post.id, item.book.id, {
        dwellTimeMs,
        postWordCount: wordCount,
        expectedReadingTimeMs,
        readingRatio: Math.min(3, dwellTimeMs / expectedReadingTimeMs),
      });
    };
  }, [expectedReadingTimeMs, item.book.id, item.post.id, wordCount]);

  const liked = likedPostIds.has(item.post.id);
  const saved = savedPostIds.has(item.post.id);

  return (
    <section
      className="min-h-screen bg-[var(--surface)]"
      aria-labelledby={`post-detail-${item.post.id}`}
    >
      <header className="sticky top-16 z-20 flex h-16 items-center gap-4 border-b border-[var(--line)] bg-[color:var(--surface-translucent)] px-4 backdrop-blur-md lg:top-0">
        <button
          className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--soft)]"
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <Icon name="chevron" className="h-5 w-5 rotate-180" />
        </button>
        <h1
          id={`post-detail-${item.post.id}`}
          className="font-serif text-xl font-semibold"
        >
          Post
        </h1>
      </header>

      <article className="border-b border-[var(--line)] px-5 py-7 sm:px-8 sm:py-9">
        <div className="flex items-center gap-3">
          <span
            className="grid h-12 w-12 place-items-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: item.post.avatarColor }}
          >
            {item.post.username
              .split(" ")
              .map((part) => part[0])
              .join("")}
          </span>
          <div>
            <strong className="block text-[15px]">{item.post.username}</strong>
            <span className="text-sm text-[var(--muted)]">
              @{item.post.handle}
            </span>
          </div>
        </div>

        <p className="mt-8 whitespace-pre-wrap text-xl leading-9 text-[var(--ink)] sm:text-[22px]">
          {item.post.text}
        </p>

        <button
          className="mt-8 flex w-full items-center gap-5 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 text-left hover:bg-[var(--soft)]"
          onClick={() => openBook(item.book.id, item.post.id)}
        >
          <BookCover book={item.book} compact />
          <span className="min-w-0">
            <strong className="block truncate font-serif">
              {item.book.title}
            </strong>
            <span className="mt-1 block truncate text-sm text-[var(--muted)]">
              {item.book.author}
            </span>
            <span className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
              {item.book.description}
            </span>
          </span>
        </button>

        <div className="mt-8 flex items-center gap-3 border-t border-[var(--line)] pt-5">
          <button
            className={`action-button rounded-xl px-3 py-2 ${liked ? "text-[var(--coral)]" : ""}`}
            onClick={() => likePost(item.post.id, item.book.id)}
            aria-pressed={liked}
          >
            <Icon
              name="heart"
              className={`h-5 w-5 ${liked ? "fill-current" : ""}`}
            />
            <span>{liked ? "Liked" : "Like"}</span>
          </button>
          <button
            className={`action-button rounded-xl px-3 py-2 ${saved ? "text-[var(--accent)]" : ""}`}
            onClick={() => savePost(item.post.id, item.book.id)}
            aria-pressed={saved}
          >
            <Icon
              name="bookmark"
              className={`h-5 w-5 ${saved ? "fill-current" : ""}`}
            />
            <span>{saved ? "Saved" : "Save"}</span>
          </button>
          <span className="ml-auto text-xs text-[var(--muted)]">
            {wordCount} words
          </span>
        </div>
      </article>
    </section>
  );
}
