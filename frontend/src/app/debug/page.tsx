"use client";

import { PageHeader } from "@/components/page-header";
import { RecentEvents } from "@/components/recent-events";
import { useBookFeed } from "@/providers/bookfeed-provider";
import { API_ROUTES } from "@/services/feed";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-[var(--ink)]">
        {value}
      </p>
    </div>
  );
}

export default function DebugPage() {
  const { debug, recentEvents, refreshFeed, status } = useBookFeed();
  return (
    <>
      <PageHeader
        eyebrow="Developer mode"
        title="Recommendation pipeline"
        description="Live observability from the FastAPI recommendation adapter."
      >
        <button
          onClick={refreshFeed}
          disabled={status === "refreshing"}
          className="shrink-0 rounded-full border border-[var(--line-strong)] px-4 py-2 text-xs font-semibold disabled:opacity-50"
        >
          {status === "refreshing" ? "Ranking…" : "Refresh"}
        </button>
      </PageHeader>
      <div className="space-y-8 p-4 sm:p-5">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl font-semibold">
              User interest profile
            </h2>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
              {debug?.retrievalMode ?? "Loading backend"}
            </span>
          </div>
          <div className="space-y-2 rounded-2xl border border-[var(--line)] p-4">
            {debug?.profile.map((item) => (
              <div
                key={item.interest}
                className="grid grid-cols-[120px_1fr_42px] items-center gap-3 text-xs"
              >
                <span className="truncate font-medium">{item.interest}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--soft)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.min(100, item.weight * 50)}%` }}
                  />
                </div>
                <span className="text-right font-mono text-[var(--muted)]">
                  {item.weight.toFixed(2)}
                </span>
              </div>
            )) ?? (
              <p className="text-sm text-[var(--muted)]">Loading profile…</p>
            )}
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-serif text-xl font-semibold">
            Pipeline snapshot
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Generated"
              value={debug?.candidateGenerationCount ?? "—"}
            />
            <Metric
              label="Retrieved"
              value={debug?.retrievedCandidateCount ?? "—"}
            />
            <Metric label="Ranked" value={debug?.rankedCandidateCount ?? "—"} />
            <Metric
              label="Final feed"
              value={debug?.finalRecommendationIds.length ?? "—"}
            />
          </div>
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Final recommendations
            </p>
            <p className="mt-2 break-words font-mono text-xs leading-5 text-[var(--accent)]">
              {debug?.finalRecommendationIds.join(" → ") ?? "Loading…"}
            </p>
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-serif text-xl font-semibold">
            Ranked candidates
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-[var(--soft)] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-3">Post</th>
                  <th className="px-3 py-3">Book</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Similarity</th>
                  <th className="px-3 py-3">Final</th>
                  <th className="px-3 py-3">Served</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {debug?.candidates.map((candidate) => (
                  <tr
                    key={candidate.postId}
                    className={candidate.selected ? "bg-emerald-50/50" : ""}
                  >
                    <td className="px-3 py-3 font-mono">{candidate.postId}</td>
                    <td className="max-w-40 truncate px-3 py-3 font-medium">
                      {candidate.bookTitle}
                    </td>
                    <td className="px-3 py-3 text-[var(--muted)]">
                      {candidate.source}
                    </td>
                    <td className="px-3 py-3 font-mono">
                      {candidate.similarity.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 font-mono font-semibold">
                      {candidate.finalScore.toFixed(2)}
                    </td>
                    <td className="px-3 py-3">
                      {candidate.selected ? "Yes" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-serif text-xl font-semibold">
            Measured latency
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Profile"
              value={`${debug?.latency.profileMs ?? "—"} ms`}
            />
            <Metric
              label="Retrieval"
              value={`${debug?.latency.retrievalMs ?? "—"} ms`}
            />
            <Metric
              label="Ranking"
              value={`${debug?.latency.rankingMs ?? "—"} ms`}
            />
            <Metric
              label="Total"
              value={`${debug?.latency.totalMs ?? "—"} ms`}
            />
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-serif text-xl font-semibold">
            Recent interaction events
          </h2>
          <RecentEvents events={recentEvents} />
        </section>
        <section className="rounded-2xl border border-[var(--line)] bg-[#1c2823] p-5 text-white">
          <h2 className="font-serif text-lg font-semibold">
            Active API boundary
          </h2>
          <p className="mt-1 text-xs leading-5 text-white/65">
            Components call services; services communicate with FastAPI.
          </p>
          <div className="mt-4 space-y-2 font-mono text-xs text-emerald-100">
            {Object.values(API_ROUTES).map((route) => (
              <p key={route}>{route}</p>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
