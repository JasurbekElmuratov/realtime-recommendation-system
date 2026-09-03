"use client";

import { useState } from "react";

import { EmptyState, FeedSkeleton } from "@/components/feed-states";
import { Icon } from "@/components/icons";
import { PostCard } from "@/components/post-card";
import { useBookFeed } from "@/providers/bookfeed-provider";

type ProfileTab = "Posts" | "Saved" | "Replies";

export default function ProfilePage() {
  const [tab, setTab] = useState<ProfileTab>("Posts");
  const { user, feed, status, savedItems } = useBookFeed();
  const visibleItems = tab === "Posts" ? feed.slice(0, 3) : tab === "Saved" ? savedItems : [];

  return (
    <div className="px-4 pb-10 pt-5 sm:px-7 lg:px-8 lg:pt-7">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-6 py-7 sm:px-10">
        <span className="pointer-events-none absolute -right-20 -top-36 h-80 w-80 rounded-full border border-[var(--line)] opacity-45" />
        <span className="pointer-events-none absolute right-20 top-4 h-56 w-56 rounded-full border border-[var(--line)] opacity-35" />
        <div className="relative flex flex-col gap-7 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <div className="grid h-36 w-36 place-items-center rounded-full border-4 border-white bg-[#3f6155] font-serif text-4xl font-bold text-white shadow-[0_8px_30px_rgba(45,55,49,.18)]">MC</div>
            <span className="absolute bottom-2 right-2 h-5 w-5 rounded-full border-[3px] border-white bg-[var(--accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h1 className="font-serif text-4xl font-bold tracking-tight">{user.name}</h1><p className="mt-1 text-sm text-[var(--muted)]">@{user.handle}</p></div>
              <div className="flex gap-2"><button className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium"><Icon name="pen" className="h-4 w-4"/>Edit Profile</button><button className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-white"><Icon name="more" className="h-5 w-5"/></button></div>
            </div>
            <p className="mt-4 max-w-md text-[15px] leading-6">{user.bio}<br/>Exploring big ideas through books and sharing what stays with me.</p>
            <div className="mt-7 grid grid-cols-2 gap-y-5 sm:grid-cols-4">
              {[[128, "Posts"], [87, "Books Saved"], ["1.2K", "Followers"], [user.following, "Following"]].map(([value, label]) => <div key={label} className="border-l border-[var(--line)] pl-5 first:border-0 first:pl-0"><strong className="block text-2xl">{value}</strong><span className="mt-1 block text-sm text-[var(--muted)]">{label}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 flex gap-7 border-b border-[var(--line)] px-5">
        {(["Posts", "Saved", "Replies"] as ProfileTab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`tab-button ${tab === item ? "tab-button-active" : ""}`}>{item}</button>)}
      </div>

      <section className="mt-2">
        {status === "loading" ? <FeedSkeleton/> : visibleItems.length ? <div className="space-y-3">{visibleItems.map((item) => <PostCard key={item.post.id} item={item} profileIdentity />)}</div> : <EmptyState title={tab === "Saved" ? "Nothing saved yet" : "No replies yet"} description={tab === "Saved" ? "Save a post from your feed and it will appear here." : "Your conversations will appear here."} />}
      </section>
    </div>
  );
}

