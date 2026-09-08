export default function PostLoading() {
  return (
    <div className="animate-pulse p-6 sm:p-8">
      <div className="h-6 w-24 rounded bg-[var(--soft)]" />
      <div className="mt-10 h-12 w-12 rounded-full bg-[var(--soft)]" />
      <div className="mt-8 h-5 w-full rounded bg-[var(--soft)]" />
      <div className="mt-3 h-5 w-4/5 rounded bg-[var(--soft)]" />
      <div className="mt-10 h-36 rounded-2xl bg-[var(--soft)]" />
    </div>
  );
}
