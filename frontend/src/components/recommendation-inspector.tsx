"use client";

import type { FeedItem } from "@/types";

export function RecommendationInspector({
  item,
  onClose,
}: {
  item: FeedItem;
  onClose: () => void;
}) {
  const signals = [
    { label: "Semantic similarity", value: item.signals.semanticSimilarity },
    { label: "Recent category interest", value: item.signals.categoryInterest },
    { label: "Author affinity", value: item.signals.authorAffinity },
    { label: "Freshness", value: item.signals.freshness },
    { label: "Popularity", value: item.signals.popularity },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-0 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="w-full max-w-md rounded-t-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`inspector-${item.post.id}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Recommendation inspector
            </p>
            <h2
              id={`inspector-${item.post.id}`}
              className="text-xl font-semibold tracking-tight"
            >
              Why you&apos;re seeing this
            </h2>
          </div>
          <button
            className="rounded-full px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--soft)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="mb-5 text-sm leading-6 text-[var(--muted)]">
          {item.signals.reason}
        </p>
        <div className="space-y-4">
          {signals.map(({ label, value }) => {
            return (
              <div key={label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="font-mono text-xs">{value.toFixed(2)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--soft)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${value * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-[var(--line)] pt-4">
          <span className="text-sm font-medium">Final ranking score</span>
          <span className="font-mono text-lg font-semibold text-[var(--accent)]">
            {item.signals.finalScore.toFixed(2)}
          </span>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Live backend values · {item.signals.modelVersion}
        </p>
      </section>
    </div>
  );
}
