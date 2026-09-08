"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Icon } from "@/components/icons";
import { RecentEvents } from "@/components/recent-events";
import { TrendingBooks } from "@/components/trending-books";
import { useBookFeed } from "@/providers/bookfeed-provider";

function RailSearch() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { search } = useBookFeed();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    search(term);
    router.push(`/explore?q=${encodeURIComponent(term)}`);
  };
  return (
    <form
      onSubmit={submit}
      className="flex h-14 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[0_5px_20px_rgba(48,45,35,.04)]"
    >
      <Icon name="search" className="h-5 w-5 text-[var(--ink)]" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
        placeholder="Search books, people, or topics"
        aria-label="Search"
      />
      <kbd className="rounded-md bg-[var(--soft)] px-2 py-1 text-[11px] text-[var(--muted)]">
        ⌘ K
      </kbd>
    </form>
  );
}

function TastePanel() {
  const { debug } = useBookFeed();
  const profile = debug?.profile ?? [];
  const highest = Math.max(...profile.map((item) => item.weight), 1);
  return (
    <section className="rail-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="rail-title">Your Reading Pulse</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Built only from activity in this app
          </p>
        </div>
        <Icon name="leaf" className="h-5 w-5 text-[var(--accent)]" />
      </div>
      {profile.length ? (
        <div className="mt-7 space-y-5">
          {profile.slice(0, 5).map((item) => (
            <div key={item.interest}>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium">
                  {item.interest}
                </span>
                <span className="font-mono text-xs text-[var(--muted)]">
                  {item.weight.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--soft)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{
                    width: `${Math.max(8, (item.weight / highest) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-7 rounded-xl border border-dashed border-[var(--line-strong)] p-4 text-sm leading-6 text-[var(--muted)]">
          No reading profile yet. Like, save, open, or search to teach BookFeed
          what you enjoy.
        </p>
      )}
      <Link
        href="/debug"
        className="mx-auto mt-7 block text-center text-sm font-medium text-[var(--accent)]"
      >
        Open recommendation inspector
      </Link>
    </section>
  );
}

function TrendingPanel() {
  const router = useRouter();
  const { search } = useBookFeed();
  const topics = [
    "Existentialism",
    "Russian Literature",
    "Morality & Ethics",
    "Psychological Fiction",
    "Free Will",
  ];
  const openTopic = (topic: string) => {
    search(topic);
    router.push(`/explore?q=${encodeURIComponent(topic)}`);
  };
  return (
    <section className="rail-card">
      <div className="flex justify-between">
        <h2 className="rail-title">Explore topics</h2>
        <button
          onClick={() => router.push("/explore")}
          className="text-xs font-medium text-[var(--accent)]"
        >
          View all
        </button>
      </div>
      <ol className="mt-5 space-y-2">
        {topics.map((topic, index) => (
          <li key={topic}>
            <button
              onClick={() => openTopic(topic)}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-[var(--soft)]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#fbf3ed] font-serif text-lg font-semibold text-[var(--coral)]">
                {index === 0 ? "♨" : index + 1}
              </span>
              <strong className="text-sm font-medium">{topic}</strong>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActivityPanel() {
  const { recentEvents } = useBookFeed();
  return (
    <section className="rail-card">
      <div className="flex items-center justify-between">
        <h2 className="rail-title">Recent Activity</h2>
        <Icon name="pulse" className="h-5 w-5 text-[var(--accent)]" />
      </div>
      <div className="mt-5">
        <RecentEvents events={recentEvents} />
      </div>
      <Link
        href="/debug"
        className="mx-auto mt-7 block text-center text-sm font-medium text-[var(--accent)]"
      >
        View event details
      </Link>
    </section>
  );
}

export function RightRail() {
  const pathname = usePathname();
  let panels = <TastePanel />;
  if (pathname === "/explore")
    panels = (
      <>
        <TrendingPanel />
        <TrendingBooks />
      </>
    );
  if (pathname === "/profile")
    panels = (
      <>
        <TastePanel />
        <ActivityPanel />
      </>
    );
  return (
    <div className="space-y-5">
      <RailSearch />
      {panels}
    </div>
  );
}
