"use client";

import { useState } from "react";

import { BookCover } from "@/components/book-cover";
import { Icon } from "@/components/icons";
import { RecommendationInspector } from "@/components/recommendation-inspector";
import { useBookFeed } from "@/providers/bookfeed-provider";
import type { FeedItem } from "@/types";

function relativeTime(value: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 3_600_000));
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export function PostCard({ item, profileIdentity = false }: { item: FeedItem; profileIdentity?: boolean }) {
  const [showInspector, setShowInspector] = useState(false);
  const { user, likedPostIds, savedPostIds, likePost, savePost, commentOnPost, openPost, openBook, notInterested } = useBookFeed();
  const liked = likedPostIds.has(item.post.id);
  const saved = savedPostIds.has(item.post.id);
  const displayName = profileIdentity ? user.name : item.post.username;
  const handle = profileIdentity ? user.handle : item.post.handle;
  const initials = displayName.split(" ").map((part) => part[0]).join("");

  return (
    <article className="post-card">
      <div className="flex gap-3.5">
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow-sm" style={{ backgroundColor: profileIdentity ? "#3f6155" : item.post.avatarColor }} onClick={() => openPost(item.post.id, item.book.id)} aria-label={`Open ${displayName}'s post`}>
          {initials}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <strong className="truncate text-[15px]">{displayName}</strong>
            <span className="truncate text-[var(--muted)]">@{handle}</span>
            <span className="text-[var(--muted)]">·</span>
            <span className="shrink-0 text-[var(--muted)]">{relativeTime(item.post.createdAt)}</span>
            <details className="group relative ml-auto">
              <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full hover:bg-[var(--soft)]"><Icon name="more" className="h-5 w-5"/></summary>
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-xl">
                <button className="block w-full px-4 py-2.5 text-left text-xs hover:bg-[var(--soft)]" onClick={() => setShowInspector(true)}>Why am I seeing this?</button>
                <button className="block w-full px-4 py-2.5 text-left text-xs text-[var(--coral)] hover:bg-[var(--soft)]" onClick={() => notInterested(item.post.id, item.book.id)}>Not interested</button>
              </div>
            </details>
          </div>

          <div className="mt-2.5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <button className="text-left text-[15px] leading-6 text-[var(--ink)]" onClick={() => openPost(item.post.id, item.book.id)}>{item.post.text}</button>
            <button className="flex items-center gap-3 text-left" onClick={() => openBook(item.book.id)}>
              <BookCover book={item.book} compact />
              <span className="min-w-0">
                <span className="block truncate font-serif text-[15px] font-bold">{item.book.title}</span>
                <span className="mt-1 block truncate text-sm text-[var(--muted)]">{item.book.author}</span>
                <span className="mt-1 block truncate text-xs text-[var(--muted)]">{item.book.genres.slice(0, 2).join(" · ")}</span>
              </span>
            </button>
          </div>

          <div className="mt-4 flex max-w-md items-center justify-between text-sm text-[var(--muted)]">
            <button className={`action-button ${liked ? "text-[var(--coral)]" : ""}`} onClick={() => likePost(item.post.id, item.book.id)} aria-pressed={liked}><Icon name="heart" className={`h-5 w-5 ${liked ? "fill-current" : ""}`}/><span>{item.post.likes + (liked ? 1 : 0)}</span></button>
            <button className="action-button" onClick={() => commentOnPost(item.post.id, item.book.id)}><Icon name="comment" className="h-5 w-5"/><span>{item.post.comments}</span></button>
            <button className={`action-button ${saved ? "text-[var(--accent)]" : ""}`} onClick={() => savePost(item.post.id, item.book.id)} aria-pressed={saved}><Icon name="bookmark" className={`h-5 w-5 ${saved ? "fill-current" : ""}`}/><span>{item.post.saves + (saved ? 1 : 0)}</span></button>
            <button className="action-button" aria-label="Share post"><Icon name="share" className="h-5 w-5"/></button>
          </div>
        </div>
      </div>
      {showInspector && <RecommendationInspector item={item} onClose={() => setShowInspector(false)} />}
    </article>
  );
}

