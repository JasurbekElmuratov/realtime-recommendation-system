"use client";

import { EmptyState } from "@/components/feed-states";
import { PageHeader } from "@/components/page-header";
import { PostCard } from "@/components/post-card";
import { useBookFeed } from "@/providers/bookfeed-provider";

export default function SavedPage() {
  const { savedItems } = useBookFeed();
  return (
    <>
      <PageHeader
        eyebrow="Your library"
        title="Saved"
        description="Posts you want to return to later."
      />
      <div className="space-y-3 p-4 sm:p-7">
        {!savedItems.length ? (
          <EmptyState
            title="Nothing saved yet"
            description="Use the Save action on a feed post and it will appear here."
            actionHref="/home"
            actionLabel="Browse your feed"
          />
        ) : (
          savedItems.map((item) => <PostCard key={item.post.id} item={item} />)
        )}
      </div>
    </>
  );
}
