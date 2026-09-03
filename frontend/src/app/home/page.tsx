"use client";

import { FormEvent, TouchEvent, useState } from "react";

import { Feed } from "@/components/feed";
import { Icon } from "@/components/icons";
import { useBookFeed } from "@/providers/bookfeed-provider";

export default function HomePage() {
  const [tab, setTab] = useState<"for-you" | "following">("for-you");
  const [text, setText] = useState("");
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const { createPost, status, refreshFeed, pendingInteractionCount } = useBookFeed();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    createPost("book-001", text.trim());
    setText("");
  };

  const startPull = (event: TouchEvent<HTMLDivElement>) => {
    if (window.scrollY <= 0 && status !== "refreshing") setTouchStart(event.touches[0].clientY);
  };

  const movePull = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStart === null || window.scrollY > 0) return;
    setPullDistance(Math.min(92, Math.max(0, (event.touches[0].clientY - touchStart) * 0.55)));
  };

  const finishPull = () => {
    if (pullDistance >= 64) void refreshFeed();
    setTouchStart(null);
    setPullDistance(0);
  };

  return (
    <div className="px-4 pb-10 pt-5 sm:px-7 lg:px-8 lg:pt-8" onTouchStart={startPull} onTouchMove={movePull} onTouchEnd={finishPull}>
      <div className="overflow-hidden text-center transition-[height] duration-150" style={{ height: pullDistance }} aria-hidden="true">
        <Icon name="sparkles" className={`mx-auto h-6 w-6 text-[var(--accent)] ${pullDistance >= 64 ? "animate-pulse" : ""}`} />
        <span className="mt-1 block text-xs text-[var(--muted)]">{pullDistance >= 64 ? "Release to refresh" : "Pull to refresh"}</span>
      </div>
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-[42px]">Home</h1>
        <button onClick={() => void refreshFeed()} disabled={status === "refreshing"} className="grid h-10 w-10 place-items-center rounded-full text-[var(--accent)] hover:bg-[var(--soft)] disabled:opacity-50" aria-label="Refresh recommendations" title="Refresh recommendations"><Icon name="sparkles" className={`h-7 w-7 ${status === "refreshing" ? "animate-pulse" : ""}`} /></button>
      </header>

      <div className="mt-5 flex gap-7 border-b border-[var(--line)]">
        <button onClick={() => setTab("for-you")} className={`tab-button ${tab === "for-you" ? "tab-button-active" : ""}`}>For You</button>
        <button onClick={() => setTab("following")} className={`tab-button ${tab === "following" ? "tab-button-active" : ""}`}>Following</button>
      </div>

      <form onSubmit={submit} className="mt-5 flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_6px_24px_rgba(46,43,34,.035)]">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#3f6155] text-xs font-semibold text-white">MC</span>
        <input value={text} onChange={(event) => setText(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--muted)]" placeholder="What are you reading?" aria-label="Post text" />
        <button type="button" className="hidden text-[var(--muted)] hover:text-[var(--accent)] sm:block" aria-label="Add image"><Icon name="image" className="h-6 w-6"/></button>
        <button type="button" className="hidden text-[var(--muted)] hover:text-[var(--accent)] sm:block" aria-label="Add GIF"><Icon name="gif" className="h-6 w-6"/></button>
        <button disabled={!text.trim()} className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-dark)] disabled:opacity-45">Post</button>
      </form>

      {pendingInteractionCount > 0 && (
        <button onClick={() => void refreshFeed()} className="mt-4 flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--soft)] px-4 py-3 text-left text-sm">
          <span><strong>{pendingInteractionCount} {pendingInteractionCount === 1 ? "interaction" : "interactions"} saved</strong><span className="ml-2 text-[var(--muted)]">Pull down when you want a new feed.</span></span>
          <span className="font-medium text-[var(--accent)]">Refresh</span>
        </button>
      )}

      <div className="mt-5">
        <Feed limit={tab === "following" ? 4 : undefined} />
      </div>
    </div>
  );
}
