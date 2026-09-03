"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { BookCover } from "@/components/book-cover";
import { PageHeader } from "@/components/page-header";
import { MOCK_BOOKS } from "@/data/mock-data";
import { useBookFeed } from "@/providers/bookfeed-provider";

const MAX_LENGTH = 320;

export default function CreatePage() {
  const { createPost } = useBookFeed();
  const [bookId, setBookId] = useState(MOCK_BOOKS[0].id);
  const [text, setText] = useState("");
  const [published, setPublished] = useState(false);
  const book = MOCK_BOOKS.find((item) => item.id === bookId)!;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    createPost(bookId, text.trim());
    setText("");
    setPublished(true);
  };

  return (
    <>
      <PageHeader eyebrow="Join the conversation" title="Create a post" description="Connect a short thought to the book that inspired it." />
      <form onSubmit={submit} className="m-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_6px_24px_rgba(46,43,34,.03)] sm:m-7 sm:p-7">
        <label htmlFor="book" className="text-sm font-semibold">Choose a book</label>
        <select id="book" value={bookId} onChange={(event) => { setBookId(event.target.value); setPublished(false); }} className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]">{MOCK_BOOKS.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.author}</option>)}</select>
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-[var(--soft)] p-3"><BookCover book={book} compact /><div><p className="font-serif font-semibold">{book.title}</p><p className="text-xs text-[var(--muted)]">{book.author} · {book.genres.join(" / ")}</p></div></div>
        <label htmlFor="post-text" className="mt-6 block text-sm font-semibold">What are you thinking?</label>
        <textarea id="post-text" value={text} maxLength={MAX_LENGTH} onChange={(event) => { setText(event.target.value); setPublished(false); }} placeholder="A detail, question, review, or recommendation…" rows={7} className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[15px] leading-6 outline-none focus:border-[var(--accent)]" />
        <div className="mt-2 flex items-center justify-between"><span className={`text-xs ${text.length > MAX_LENGTH * 0.9 ? "text-amber-700" : "text-[var(--muted)]"}`}>{text.length}/{MAX_LENGTH}</span><button disabled={!text.trim()} className="rounded-xl bg-[var(--coral)] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Publish post</button></div>
        {published && <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Your mock post was published to frontend state. <Link href="/profile" className="font-semibold underline">View it on your profile</Link>.</div>}
      </form>
    </>
  );
}
