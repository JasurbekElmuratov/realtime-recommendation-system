"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { BookCover } from "@/components/book-cover";
import { Icon } from "@/components/icons";
import { RecommendationInspector } from "@/components/recommendation-inspector";
import { useBookFeed } from "@/providers/bookfeed-provider";
import type { FeedItem } from "@/types";

function relativeTime(value: string) {
  const hours = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 3_600_000),
  );
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function PostCard({
  item,
  profileIdentity = false,
}: {
  item: FeedItem;
  profileIdentity?: boolean;
}) {
  const router = useRouter();
  const [showInspector, setShowInspector] = useState(false);
  const [showBookDetails, setShowBookDetails] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentDelta, setCommentDelta] = useState(0);
  const [shared, setShared] = useState(false);
  const {
    user,
    likedPostIds,
    savedPostIds,
    likePost,
    savePost,
    commentOnPost,
    openBook,
    notInterested,
  } = useBookFeed();
  const liked = likedPostIds.has(item.post.id);
  const saved = savedPostIds.has(item.post.id);
  const displayName = profileIdentity ? user.displayName : item.post.username;
  const handle = profileIdentity ? user.username : item.post.handle;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("");
  function showPost() {
    router.push(`/post/${encodeURIComponent(item.post.id)}`);
  }

  function toggleBookDetails() {
    openBook(item.book.id, item.post.id);
    setShowBookDetails(!showBookDetails);
  }

  const submitComment = (event: FormEvent) => {
    event.preventDefault();
    if (!commentText.trim()) return;
    commentOnPost(item.post.id, item.book.id);
    setCommentDelta((value) => value + 1);
    setCommentText("");
    setShowComment(false);
  };

  const sharePost = async () => {
    const text = `${item.post.text}\n\n${item.book.title} — ${item.book.author}`;
    const url = `${window.location.origin}/post/${encodeURIComponent(item.post.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "BookFeed post", text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      /* Closing the native share sheet is not an error. */
    }
  };

  return (
    <article className="post-card">
      <div className="flex gap-3.5">
        <button
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow-sm"
          style={{
            backgroundColor: profileIdentity
              ? "#3f6155"
              : item.post.avatarColor,
          }}
          onClick={showPost}
          aria-label={`Open ${displayName}'s post`}
        >
          {initials}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <strong className="truncate text-[15px]">{displayName}</strong>
            <span className="truncate text-[var(--muted)]">@{handle}</span>
            <span className="text-[var(--muted)]">·</span>
            <span className="shrink-0 text-[var(--muted)]">
              {relativeTime(item.post.createdAt)}
            </span>
            <details className="group relative ml-auto">
              <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full hover:bg-[var(--soft)]">
                <Icon name="more" className="h-5 w-5" />
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-[var(--line)] bg-white py-1 shadow-xl">
                <button
                  className="block w-full px-4 py-2.5 text-left text-xs hover:bg-[var(--soft)]"
                  onClick={() => setShowInspector(true)}
                >
                  Why am I seeing this?
                </button>
                <button
                  className="block w-full px-4 py-2.5 text-left text-xs text-[var(--coral)] hover:bg-[var(--soft)]"
                  onClick={() => notInterested(item.post.id, item.book.id)}
                >
                  Not interested
                </button>
              </div>
            </details>
          </div>

          <div className="mt-2.5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <button
              className="text-left text-[15px] leading-6 text-[var(--ink)]"
              onClick={showPost}
            >
              {item.post.text}
            </button>
            <button
              className="flex items-center gap-3 text-left"
              onClick={toggleBookDetails}
              aria-expanded={showBookDetails}
            >
              <BookCover book={item.book} compact />
              <span className="min-w-0">
                <span className="block truncate font-serif text-[15px] font-bold">
                  {item.book.title}
                </span>
                <span className="mt-1 block truncate text-sm text-[var(--muted)]">
                  {item.book.author}
                </span>
                <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                  {item.book.genres.slice(0, 2).join(" · ")}
                </span>
              </span>
            </button>
          </div>

          {showBookDetails && (
            <div className="mt-3 rounded-xl bg-[var(--soft)] p-4 text-sm leading-6 text-[var(--muted)]">
              <strong className="mb-1 block font-serif text-[var(--ink)]">
                {item.book.title}
              </strong>
              {item.book.description}
            </div>
          )}

          <div className="mt-4 flex max-w-md items-center justify-between text-sm text-[var(--muted)]">
            <button
              className={`action-button ${liked ? "text-[var(--coral)]" : ""}`}
              onClick={() => likePost(item.post.id, item.book.id)}
              aria-pressed={liked}
            >
              <Icon
                name="heart"
                className={`h-5 w-5 ${liked ? "fill-current" : ""}`}
              />
              <span>{item.post.likes + (liked ? 1 : 0)}</span>
            </button>
            <button
              className="action-button"
              onClick={() => setShowComment((value) => !value)}
              aria-expanded={showComment}
            >
              <Icon name="comment" className="h-5 w-5" />
              <span>{item.post.comments + commentDelta}</span>
            </button>
            <button
              className={`action-button ${saved ? "text-[var(--accent)]" : ""}`}
              onClick={() => savePost(item.post.id, item.book.id)}
              aria-pressed={saved}
            >
              <Icon
                name="bookmark"
                className={`h-5 w-5 ${saved ? "fill-current" : ""}`}
              />
              <span>{item.post.saves + (saved ? 1 : 0)}</span>
            </button>
            <button
              className="action-button"
              aria-label="Share post"
              onClick={() => void sharePost()}
            >
              <Icon name="share" className="h-5 w-5" />
              <span className="text-xs">{shared ? "Copied" : "Share"}</span>
            </button>
          </div>
          {showComment && (
            <form onSubmit={submitComment} className="mt-3 flex gap-2">
              <input
                autoFocus
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                maxLength={320}
                placeholder="Write a comment…"
                className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                disabled={!commentText.trim()}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                Comment
              </button>
            </form>
          )}
        </div>
      </div>
      {showInspector && (
        <RecommendationInspector
          item={item}
          onClose={() => setShowInspector(false)}
        />
      )}
    </article>
  );
}
