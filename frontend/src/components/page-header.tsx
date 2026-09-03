export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <header className="sticky top-16 z-10 border-b border-[var(--line)] bg-[color:var(--surface-translucent)] px-5 py-6 backdrop-blur-md sm:px-8 lg:top-0">
      <div className="flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{eyebrow}</p>}
          <h1 className={`${eyebrow ? "mt-1" : ""} font-serif text-3xl font-semibold tracking-tight text-[var(--ink)]`}>{title}</h1>
          {description && <p className="mt-1.5 text-sm text-[var(--muted)]">{description}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}
