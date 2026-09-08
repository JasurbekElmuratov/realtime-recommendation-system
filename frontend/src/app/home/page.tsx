"use client";

import { TouchEvent, useState } from "react";

import { Feed } from "@/components/feed";
import { Icon } from "@/components/icons";
import { useBookFeed } from "@/providers/bookfeed-provider";

export default function HomePage() {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const { status, refreshFeed, interactionError } = useBookFeed();

  const startPull = (event: TouchEvent<HTMLDivElement>) => {
    if (window.scrollY <= 0 && status !== "refreshing")
      setTouchStart(event.touches[0].clientY);
  };

  const movePull = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStart === null || window.scrollY > 0) return;
    setPullDistance(
      Math.min(92, Math.max(0, (event.touches[0].clientY - touchStart) * 0.55)),
    );
  };

  const finishPull = () => {
    if (pullDistance >= 64) void refreshFeed();
    setTouchStart(null);
    setPullDistance(0);
  };

  return (
    <div
      className="px-4 pb-10 pt-5 sm:px-7 lg:px-8 lg:pt-8"
      onTouchStart={startPull}
      onTouchMove={movePull}
      onTouchEnd={finishPull}
    >
      <div
        className="overflow-hidden text-center transition-[height] duration-150"
        style={{ height: pullDistance }}
        aria-hidden="true"
      >
        <Icon
          name="sparkles"
          className={`mx-auto h-6 w-6 text-[var(--accent)] ${pullDistance >= 64 ? "animate-pulse" : ""}`}
        />
        <span className="mt-1 block text-xs text-[var(--muted)]">
          {pullDistance >= 64 ? "Release to refresh" : "Pull to refresh"}
        </span>
      </div>
      <header className="flex items-center justify-between">
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-[42px]">
          Home
        </h1>
        <button
          onClick={() => void refreshFeed()}
          disabled={status === "refreshing"}
          className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--soft)] disabled:opacity-50"
          aria-label="Refresh recommendations"
          title="Refresh recommendations"
        >
          <Icon
            name="sparkles"
            className={`h-5 w-5 ${status === "refreshing" ? "animate-pulse" : ""}`}
          />
          {status === "refreshing" ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <div className="mt-5 border-b border-[var(--line)]">
        <span className="tab-button tab-button-active inline-block">
          For You
        </span>
      </div>

      {interactionError && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {interactionError}
        </p>
      )}

      <div className="mt-5">
        <Feed />
      </div>
    </div>
  );
}
