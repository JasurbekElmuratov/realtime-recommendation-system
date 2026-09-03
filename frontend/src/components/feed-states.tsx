export function FeedSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading recommendations">
      {[1, 2, 3].map((item) => (
        <div key={item} className="animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex gap-3"><div className="h-10 w-10 rounded-full bg-[var(--soft)]" /><div className="flex-1 space-y-3"><div className="h-4 w-40 rounded bg-[var(--soft)]" /><div className="h-20 rounded-xl bg-[var(--soft)]" /><div className="h-4 w-full rounded bg-[var(--soft)]" /><div className="h-4 w-4/5 rounded bg-[var(--soft)]" /></div></div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, actionHref, actionLabel }: { title: string; description: string; actionHref?: string; actionLabel?: string }) {
  return <div className="px-6 py-20 text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--soft)] text-xl">∅</div><h2 className="font-serif text-xl font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{description}</p>{actionHref && actionLabel && <a href={actionHref} className="mt-5 inline-block rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-white">{actionLabel}</a>}</div>;
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return <div className="px-6 py-20 text-center"><h2 className="font-serif text-xl font-semibold">Something interrupted the feed</h2><p className="mt-2 text-sm text-[var(--muted)]">{message ?? "The service boundary is ready to surface backend errors without breaking the page."}</p><button className="mt-5 rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-white" onClick={onRetry}>Try again</button></div>;
}
