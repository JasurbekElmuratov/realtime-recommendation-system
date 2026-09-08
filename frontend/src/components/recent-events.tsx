"use client";

import type { InteractionEvent } from "@/types";

function eventText(event: InteractionEvent) {
  if (event.eventType === "search") return `searched “${event.query}”`;
  if (event.eventType === "post_dwell")
    return `read post #${event.postId} for ${Math.round((event.dwellTimeMs ?? 0) / 1000)}s (${Math.round((event.readingRatio ?? 0) * 100)}% of expected time)`;
  const target = event.postId
    ? `post #${event.postId}`
    : event.bookId
      ? `book #${event.bookId}`
      : "an item";
  const verb = {
    impression: "saw",
    post_click: "opened",
    post_dwell: "read",
    book_open: "opened",
    like: "liked",
    unlike: "removed a like from",
    save: "saved",
    unsave: "removed a save from",
    comment: "commented on",
    search: "searched",
    follow_author: "followed the author of",
    not_interested: "hid",
  }[event.eventType];
  return `${verb} ${target}`;
}

export function RecentEvents({ events }: { events: InteractionEvent[] }) {
  if (!events.length)
    return (
      <p className="rounded-xl border border-dashed border-[var(--line-strong)] p-5 text-sm text-[var(--muted)]">
        Interact with a post or search for a book. Events will appear here
        immediately.
      </p>
    );
  return (
    <ol className="space-y-2">
      {events.slice(0, 8).map((event) => (
        <li
          key={event.id}
          className="flex gap-3 rounded-xl bg-[var(--paper)] p-3 text-sm"
        >
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.syncStatus === "failed" ? "bg-amber-500" : "bg-[var(--accent)]"}`}
          />
          <span>
            <span className="font-medium text-[var(--ink)]">
              {eventText(event)}
            </span>
            <span className="mt-0.5 block font-mono text-[10px] uppercase text-[var(--muted)]">
              {event.eventType} · {event.syncStatus ?? "synced"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
