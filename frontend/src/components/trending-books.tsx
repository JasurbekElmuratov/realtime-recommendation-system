"use client";

import { BookCover } from "@/components/book-cover";
import { MOCK_BOOKS } from "@/data/mock-data";
import { useBookFeed } from "@/providers/bookfeed-provider";

export function TrendingBooks() {
  const { openBook } = useBookFeed();
  const books = MOCK_BOOKS.slice(0, 4);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="border-b border-[var(--line)] px-4 py-4">
        <h2 className="font-serif text-lg font-semibold text-[var(--ink)]">Trending books</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Popular with readers this week</p>
      </div>
      <div>
        {books.map((book, index) => (
          <button key={book.id} className="flex w-full items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left last:border-0 hover:bg-[var(--hover)]" onClick={() => openBook(book.id)}>
            <span className="w-4 self-start pt-1 text-xs font-semibold text-[var(--muted)]">{index + 1}</span>
            <BookCover book={book} compact />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[var(--ink)]">{book.title}</span>
              <span className="block truncate text-xs text-[var(--muted)]">{book.author}</span>
              <span className="mt-1 block text-[11px] font-medium text-[var(--accent)]">{book.genres[0]}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
