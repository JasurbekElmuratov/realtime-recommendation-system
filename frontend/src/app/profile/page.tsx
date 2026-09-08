"use client";

import { useState } from "react";

import { EmptyState, FeedSkeleton } from "@/components/feed-states";
import { PostCard } from "@/components/post-card";
import { useBookFeed } from "@/providers/bookfeed-provider";

type ProfileTab = "Posts" | "Saved" | "Likes";

export default function ProfilePage() {
  const [tab, setTab] = useState<ProfileTab>("Posts");
  const { user, profileItems, status, savedItems, likedItems } = useBookFeed();
  let visibleItems = profileItems;
  let emptyTitle = "No posts yet";
  let emptyDescription = "This account starts with no posts.";
  if (tab === "Saved") {
    visibleItems = savedItems;
    emptyTitle = "Nothing saved yet";
    emptyDescription =
      "Save a post from your feed and it will appear here after refresh too.";
  }
  if (tab === "Likes") {
    visibleItems = likedItems;
    emptyTitle = "No likes yet";
    emptyDescription =
      "Like a post from your feed and it will appear here after refresh too.";
  }
  const initials = user.displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="px-4 pb-10 pt-5 sm:px-7 lg:px-8 lg:pt-7">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-6 py-7 sm:px-10">
        <span className="pointer-events-none absolute -right-20 -top-36 h-80 w-80 rounded-full border border-[var(--line)] opacity-45" />
        <span className="pointer-events-none absolute right-20 top-4 h-56 w-56 rounded-full border border-[var(--line)] opacity-35" />
        <div className="relative flex flex-col gap-7 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <div className="grid h-36 w-36 place-items-center rounded-full border-4 border-white bg-[#3f6155] font-serif text-4xl font-bold text-white shadow-[0_8px_30px_rgba(45,55,49,.18)]">
              {initials}
            </div>
            <span className="absolute bottom-2 right-2 h-5 w-5 rounded-full border-[3px] border-white bg-[var(--accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-serif text-4xl font-bold tracking-tight">
                  {user.displayName}
                </h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  @{user.username}
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-md text-[15px] leading-6">{user.bio}</p>
            <div className="mt-7 grid grid-cols-2 gap-y-5 sm:grid-cols-4">
              {[
                [profileItems.length, "Posts"],
                [savedItems.length, "Saved"],
                [likedItems.length, "Likes"],
                [user.following, "Following"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="border-l border-[var(--line)] pl-5 first:border-0 first:pl-0"
                >
                  <strong className="block text-2xl">{value}</strong>
                  <span className="mt-1 block text-sm text-[var(--muted)]">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 flex gap-7 border-b border-[var(--line)] px-5">
        {(["Posts", "Saved", "Likes"] as ProfileTab[]).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`tab-button ${tab === item ? "tab-button-active" : ""}`}
          >
            {item}
          </button>
        ))}
      </div>

      <section className="mt-2">
        {status === "loading" && <FeedSkeleton />}
        {status !== "loading" && visibleItems.length > 0 && (
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <PostCard
                key={item.post.id}
                item={item}
                profileIdentity={tab === "Posts"}
              />
            ))}
          </div>
        )}
        {status !== "loading" && visibleItems.length === 0 && (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        )}
      </section>
    </div>
  );
}
