"use client";

import { MOCK_BOOKS, MOCK_POSTS } from "@/data/mock-data";
import type { InteractionEvent } from "@/types";

function eventText(event: InteractionEvent) {
  const post = MOCK_POSTS.find((item) => item.id === event.postId);
  const book = MOCK_BOOKS.find((item) => item.id === (event.bookId ?? post?.bookId));
  const target = event.query ? `“${event.query}”` : book?.title ?? event.postId ?? "item";
  const verb = event.eventType === "like" && event.active === false
    ? "removed a like from"
    : event.eventType === "save" && event.active === false
      ? "removed a saved post about"
      : { impression: "saw", post_click: "opened post about", book_open: "opened", like: "liked a post about", save: "saved a post about", comment: "commented on", search: "searched", follow_author: "followed the author of", not_interested: "hid a post about" }[event.eventType];
  return `${verb} ${target}`;
}

export function RecentEvents({ events }: { events: InteractionEvent[] }) {
  if (!events.length) return <p className="rounded-xl border border-dashed border-[var(--line-strong)] p-5 text-sm text-[var(--muted)]">Interact with a post or search for a book. Events will appear here immediately.</p>;
  return (
    <ol className="space-y-2">
      {events.slice(0, 8).map((event) => <li key={event.id} className="flex gap-3 rounded-xl bg-[var(--paper)] p-3 text-sm"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" /><span><span className="font-medium text-[var(--ink)]">{eventText(event)}</span><span className="mt-0.5 block font-mono text-[10px] uppercase text-[var(--muted)]">{event.eventType}</span></span></li>)}
    </ol>
  );
}
