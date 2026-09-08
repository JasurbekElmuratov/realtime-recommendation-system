"use client";

import { useState } from "react";

import { BookCover } from "@/components/book-cover";
import { useBookFeed } from "@/providers/bookfeed-provider";
import type { Book } from "@/types";

export function BookCard({ book }: { book: Book }) {
  const [expanded, setExpanded] = useState(false);
  const { openBook, followAuthor, followedAuthors } = useBookFeed();
  const followed = followedAuthors.has(book.author);
  function showBook() {
    openBook(book.id);
    setExpanded(!expanded);
  }

  return (
    <article className="flex gap-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <button
        onClick={showBook}
        aria-label={`Open ${book.title}`}
        aria-expanded={expanded}
      >
        <BookCover book={book} />
      </button>
      <div className="min-w-0 flex-1">
        <button
          className="text-left"
          onClick={showBook}
          aria-expanded={expanded}
        >
          <h2 className="font-serif text-lg font-semibold leading-tight text-[var(--ink)]">
            {book.title}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {book.author}
            {book.year ? ` · ${book.year}` : ""}
          </p>
        </button>
        <p
          className={`mt-2 text-sm leading-5 text-[var(--muted)] ${expanded ? "" : "line-clamp-2"}`}
        >
          {book.description}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {book.genres.slice(0, 2).map((genre) => (
            <span
              key={genre}
              className="rounded-full bg-[var(--soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]"
            >
              {genre}
            </span>
          ))}
          <button
            disabled={followed}
            onClick={() => followAuthor(book.id)}
            className="ml-auto text-xs font-semibold text-[var(--accent)] disabled:text-[var(--muted)]"
          >
            {followed ? "Following" : "Follow author"}
          </button>
        </div>
      </div>
    </article>
  );
}
