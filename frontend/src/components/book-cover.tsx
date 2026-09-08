import Image from "next/image";

import type { Book } from "@/types";

export function BookCover({
  book,
  compact = false,
}: {
  book: Book;
  compact?: boolean;
}) {
  if (book.coverUrl)
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-[4px] border border-black/10 bg-[var(--soft)] shadow-sm ${compact ? "h-[74px] w-[50px]" : "h-28 w-[76px]"}`}
      >
        <Image
          src={book.coverUrl}
          alt={`Cover of ${book.title}`}
          fill
          sizes={compact ? "50px" : "76px"}
          className="object-cover"
        />
      </div>
    );
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[4px] border border-black/10 shadow-sm ${compact ? "h-[74px] w-[50px]" : "h-28 w-[76px]"}`}
      style={{
        backgroundColor: book.coverColor ?? "#61785f",
        color: book.coverTextColor ?? "#ffffff",
      }}
      aria-label={`Cover placeholder for ${book.title}`}
    >
      <div className="absolute inset-x-1.5 top-2 border-t border-current/35" />
      <div className="absolute inset-x-1.5 bottom-2 border-t border-current/35" />
      <span
        className={`absolute inset-x-1.5 top-1/2 -translate-y-1/2 text-center font-serif font-semibold leading-tight ${compact ? "text-[8px]" : "text-[10px]"}`}
      >
        {book.title}
        <small className="mt-1 block text-[6px] font-normal uppercase tracking-wider opacity-70">
          {book.author}
        </small>
      </span>
    </div>
  );
}
