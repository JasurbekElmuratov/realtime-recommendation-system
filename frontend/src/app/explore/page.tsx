"use client";

import { FormEvent, useMemo, useState } from "react";

import { BookCard } from "@/components/book-card";
import { BookCover } from "@/components/book-cover";
import { EmptyState, FeedSkeleton } from "@/components/feed-states";
import { Icon } from "@/components/icons";
import { PostCard } from "@/components/post-card";
import { MOCK_BOOKS } from "@/data/mock-data";
import { useBookFeed } from "@/providers/bookfeed-provider";

type SearchTab = "Posts" | "Books" | "People" | "Topics";

export default function ExplorePage() {
  const [query, setQuery] = useState("dostoevsky");
  const [submittedQuery, setSubmittedQuery] = useState("dostoevsky");
  const [tab, setTab] = useState<SearchTab>("Posts");
  const { search, feed, status } = useBookFeed();
  const term = submittedQuery.trim().toLowerCase();

  const books = useMemo(() => MOCK_BOOKS.filter((book) => !term || `${book.title} ${book.author} ${book.genres.join(" ")} ${book.description}`.toLowerCase().includes(term)), [term]);
  const posts = useMemo(() => feed.filter((item) => !term || `${item.post.text} ${item.book.title} ${item.book.author}`.toLowerCase().includes(term)), [feed, term]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSubmittedQuery(query.trim());
    search(query.trim());
  };

  return (
    <div className="px-4 pb-10 pt-5 sm:px-7 lg:px-8 lg:pt-7">
      <form onSubmit={submit} className="flex h-14 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[0_5px_20px_rgba(48,45,35,.04)]">
        <Icon name="search" className="h-6 w-6 text-[var(--ink)]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base outline-none" aria-label="Search books, people, or topics" />
        <kbd className="rounded-md bg-[var(--soft)] px-2.5 py-1.5 text-xs text-[var(--muted)]">⌘ K</kbd>
      </form>

      <div className="mt-5 flex items-end justify-between border-b border-[var(--line)]">
        <div className="flex gap-5 sm:gap-7">
          {(["Posts", "Books", "People", "Topics"] as SearchTab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`tab-button ${tab === item ? "tab-button-active" : ""}`}>{item}</button>)}
        </div>
        <button className="mb-3 hidden items-center gap-1 text-sm text-[var(--muted)] sm:flex">Most relevant <span className="text-lg">⌄</span></button>
      </div>

      {tab === "Posts" && (
        <section className="mt-3">
          {status === "loading" ? <FeedSkeleton /> : !posts.length ? <EmptyState title="No matching posts" description="Try a broader author, title, or topic." /> : <div className="space-y-3">{posts.slice(0, 3).map((item) => <PostCard key={item.post.id} item={item} />)}</div>}
          {posts.length > 3 && <button className="mx-auto mt-3 flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-2 text-xs font-medium">Show more posts <span>⌄</span></button>}
        </section>
      )}

      {tab === "Books" && <section className="mt-5 grid gap-3">{books.length ? books.map((book) => <BookCard key={book.id} book={book}/>) : <EmptyState title="No matching books" description="Try another title, author, or genre." />}</section>}
      {(tab === "People" || tab === "Topics") && <EmptyState title={`No matching ${tab.toLowerCase()}`} description="This demo currently searches the mock book and post collections." />}

      {tab === "Posts" && books.length > 0 && (
        <section className="mt-5 border-t border-[var(--line)] pt-4">
          <div className="flex items-center justify-between"><h2 className="font-serif text-lg font-semibold">Matching books</h2><button onClick={() => setTab("Books")} className="flex items-center gap-1 text-xs font-medium text-[var(--accent)]">View all books <Icon name="chevron" className="h-4 w-4"/></button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {books.slice(0, 4).map((book, index) => <article key={book.id} className="flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3"><BookCover book={book}/><div className="min-w-0"><h3 className="font-serif text-sm font-bold leading-tight">{book.title}</h3><p className="mt-1 text-xs text-[var(--muted)]">{book.author}</p><p className="mt-4 text-xs text-[var(--muted)]"><span className="text-amber-500">★</span> {(4.6 - index * .1).toFixed(1)} <span className="ml-2">{[25.1,18.3,9.2,6.7][index]}K readers</span></p></div></article>)}
          </div>
        </section>
      )}
    </div>
  );
}

