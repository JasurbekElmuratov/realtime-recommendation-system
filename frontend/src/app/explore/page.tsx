"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { BookCard } from "@/components/book-card";
import { BookCover } from "@/components/book-cover";
import { EmptyState, FeedSkeleton } from "@/components/feed-states";
import { Icon } from "@/components/icons";
import { PostCard } from "@/components/post-card";
import { useBookFeed } from "@/providers/bookfeed-provider";
import { feedService } from "@/services/feed";
import type { Book, FeedItem } from "@/types";

type SearchTab = "Posts" | "Books";

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("Posts");
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { search, user } = useBookFeed();

  const loadResults = useCallback(
    async (term: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await feedService.search(user.id, term);
        setPosts(result.posts);
        setBooks(result.books);
      } catch {
        setError("Search could not reach the BookFeed API.");
      } finally {
        setLoading(false);
      }
    },
    [user.id],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const initialQuery =
        new URLSearchParams(window.location.search).get("q")?.trim() || "";
      setQuery(initialQuery);
      setSubmittedQuery(initialQuery);
      if (initialQuery) void loadResults(initialQuery);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadResults]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setSubmittedQuery(term);
    search(term);
    void loadResults(term);
  };

  function renderPosts() {
    if (loading) return <FeedSkeleton />;
    if (!submittedQuery) {
      return (
        <EmptyState
          title="Start with a search"
          description="Your first search will be the first strong signal in this fresh profile."
        />
      );
    }
    if (!posts.length) {
      return (
        <EmptyState
          title="No matching posts"
          description="Try a broader author, title, or topic."
        />
      );
    }
    return (
      <div className="space-y-3">
        {posts.map((item) => (
          <PostCard key={item.post.id} item={item} />
        ))}
      </div>
    );
  }

  function renderBooks() {
    if (loading) return <FeedSkeleton />;
    if (!submittedQuery) {
      return (
        <EmptyState
          title="Start with a search"
          description="Search to browse real books from books.csv."
        />
      );
    }
    if (!books.length) {
      return (
        <EmptyState
          title="No matching books"
          description="Try another title, author, or genre."
        />
      );
    }
    return books.map((book) => <BookCard key={book.id} book={book} />);
  }

  return (
    <div className="px-4 pb-10 pt-5 sm:px-7 lg:px-8 lg:pt-7">
      <form
        onSubmit={submit}
        className="flex h-14 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[0_5px_20px_rgba(48,45,35,.04)]"
      >
        <Icon name="search" className="h-6 w-6 text-[var(--ink)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
          aria-label="Search books, people, or topics"
        />
        <kbd className="rounded-md bg-[var(--soft)] px-2.5 py-1.5 text-xs text-[var(--muted)]">
          ⌘ K
        </kbd>
      </form>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {submittedQuery ? (
          <>
            Results for “{submittedQuery}” come from the real post and book
            CSVs.
          </>
        ) : (
          "Search for a title, author, genre, or idea. Your searches will shape future feed batches."
        )}
      </p>

      <div className="mt-5 flex items-end justify-between border-b border-[var(--line)]">
        <div className="flex gap-5 sm:gap-7">
          {(["Posts", "Books"] as SearchTab[]).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`tab-button ${tab === item ? "tab-button-active" : ""}`}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="mb-3 hidden text-sm text-[var(--muted)] sm:block">
          Most relevant
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      {tab === "Posts" && <section className="mt-3">{renderPosts()}</section>}
      {tab === "Books" && (
        <section className="mt-5 grid gap-3">{renderBooks()}</section>
      )}

      {tab === "Posts" && books.length > 0 && (
        <section className="mt-5 border-t border-[var(--line)] pt-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold">Matching books</h2>
            <button
              onClick={() => setTab("Books")}
              className="flex items-center gap-1 text-xs font-medium text-[var(--accent)]"
            >
              View all books <Icon name="chevron" className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {books.slice(0, 4).map((book) => (
              <article
                key={book.id}
                className="flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3"
              >
                <BookCover book={book} />
                <div className="min-w-0">
                  <h3 className="font-serif text-sm font-bold leading-tight">
                    {book.title}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {book.author}
                  </p>
                  <p className="mt-4 text-xs text-[var(--muted)]">
                    {book.genres.join(" · ")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
