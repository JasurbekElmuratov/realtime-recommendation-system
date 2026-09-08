"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { BookCover } from "@/components/book-cover";
import { PageHeader } from "@/components/page-header";
import { useBookFeed } from "@/providers/bookfeed-provider";

const MAX_LENGTH = 320;

export default function CreatePage() {
  const { createPost, catalogBooks } = useBookFeed();
  const [bookId, setBookId] = useState("");
  const [text, setText] = useState("");
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedId = bookId || catalogBooks[0]?.id || "";
  const book =
    catalogBooks.find((item) => item.id === selectedId) ?? catalogBooks[0];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    if (!book) return;
    setPublishing(true);
    setError(null);
    try {
      await createPost(book.id, text.trim());
      setText("");
      setPublished(true);
    } catch {
      setError("The post could not be saved. Make sure FastAPI is running.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Join the conversation"
        title="Create a post"
        description="Connect a short thought to the book that inspired it."
      />
      <form
        onSubmit={submit}
        className="m-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_6px_24px_rgba(46,43,34,.03)] sm:m-7 sm:p-7"
      >
        <label htmlFor="book" className="text-sm font-semibold">
          Choose a book
        </label>
        <select
          id="book"
          value={selectedId}
          onChange={(event) => {
            setBookId(event.target.value);
            setPublished(false);
          }}
          className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
        >
          {catalogBooks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} — {item.author}
            </option>
          ))}
        </select>
        {book && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-[var(--soft)] p-3">
            <BookCover book={book} compact />
            <div>
              <p className="font-serif font-semibold">{book.title}</p>
              <p className="text-xs text-[var(--muted)]">
                {book.author} · {book.genres.join(" / ")}
              </p>
            </div>
          </div>
        )}
        <label htmlFor="post-text" className="mt-6 block text-sm font-semibold">
          What are you thinking?
        </label>
        <textarea
          id="post-text"
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(event) => {
            setText(event.target.value);
            setPublished(false);
          }}
          placeholder="A detail, question, review, or recommendation…"
          rows={7}
          className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[15px] leading-6 outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-2 flex items-center justify-between">
          <span
            className={`text-xs ${text.length > MAX_LENGTH * 0.9 ? "text-amber-700" : "text-[var(--muted)]"}`}
          >
            {text.length}/{MAX_LENGTH}
          </span>
          <button
            disabled={!text.trim() || publishing}
            className="rounded-xl bg-[var(--coral)] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {publishing ? "Publishing…" : "Publish post"}
          </button>
        </div>
        {published && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Post saved to <code>data/posts.csv</code>.{" "}
            <Link href="/profile" className="font-semibold underline">
              View it on your profile
            </Link>
            .
          </div>
        )}
        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
      </form>
    </>
  );
}
