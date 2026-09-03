"use client";

import { FormEvent, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Icon } from "@/components/icons";
import { useBookFeed } from "@/providers/bookfeed-provider";

const TASTE = [
  { label: "Philosophy", value: 92, icon: "brain" as const },
  { label: "Science Fiction", value: 85, icon: "planet" as const },
  { label: "Classics", value: 78, icon: "leaf" as const },
  { label: "AI & Technology", value: 74, icon: "code" as const },
  { label: "History", value: 68, icon: "history" as const },
];

function RailSearch() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { search } = useBookFeed();
  const submit = (event: FormEvent) => { event.preventDefault(); if (!query.trim()) return; search(query.trim()); router.push(`/explore?q=${encodeURIComponent(query.trim())}`); };
  return <form onSubmit={submit} className="flex h-14 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[0_5px_20px_rgba(48,45,35,.04)]"><Icon name="search" className="h-5 w-5 text-[var(--ink)]"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]" placeholder="Search books, people, or topics" aria-label="Search"/><kbd className="rounded-md bg-[var(--soft)] px-2 py-1 text-[11px] text-[var(--muted)]">⌘ K</kbd></form>;
}

function TastePanel({ compact = false }: { compact?: boolean }) {
  const rows = compact ? TASTE.filter((item) => item.label !== "Classics" && item.label !== "AI & Technology") : TASTE;
  return <section className="rail-card"><div className="flex items-center justify-between"><div><h2 className="rail-title">{compact ? "Your Reading Pulse" : "Reading Taste"}</h2>{compact && <p className="mt-1 text-sm text-[var(--muted)]">Insights personalized for you</p>}</div><Icon name="leaf" className="h-5 w-5 text-[var(--accent)]"/></div><div className="mt-7 space-y-6">{rows.map((item) => <div key={item.label} className="grid grid-cols-[25px_1fr_38px] items-center gap-x-3"><Icon name={item.icon} className={`h-5 w-5 ${item.label === "History" ? "text-[var(--coral)]" : "text-[var(--accent)]"}`}/><span className="text-sm font-medium">{item.label}</span><span className="text-right text-sm">{item.value}%</span><div className="col-start-2 col-span-2 mt-2 h-1 overflow-hidden rounded-full bg-[var(--soft)]"><div className={`h-full rounded-full ${item.label === "History" ? "bg-[var(--coral)]" : "bg-[var(--accent)]"}`} style={{width: `${item.value}%`}}/></div></div>)}</div><button className="mx-auto mt-8 block text-sm font-medium text-[var(--accent)]">View all {compact ? "insights" : "interests"}</button></section>;
}

function TrendingPanel() {
  const topics = [["Existentialism", "12.4K posts"], ["Russian Literature", "9.8K posts"], ["Morality & Ethics", "8.1K posts"], ["Psychological Fiction", "5.4K posts"], ["Free Will", "3.7K posts"]];
  return <section className="rail-card"><div className="flex justify-between"><h2 className="rail-title">Trending topics</h2><button className="text-xs font-medium text-[var(--accent)]">View all</button></div><ol className="mt-5 space-y-5">{topics.map(([topic, count], index) => <li key={topic} className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#fbf3ed] font-serif text-lg font-semibold text-[var(--coral)]">{index === 0 ? "♨" : index + 1}</span><span><strong className="block text-sm font-medium">{topic}</strong><span className="text-xs text-[var(--muted)]">{count}</span></span></li>)}</ol></section>;
}

function SuggestedPeople() {
  return <section className="rail-card"><div className="flex justify-between"><h2 className="rail-title">Suggested people</h2><button className="text-xs font-medium text-[var(--accent)]">View all</button></div><div className="mt-5 space-y-5">{[["Maria Popova", "brainpicker", "120K"], ["Dean Bokhari", "deanreads", "89K"], ["Thomas Chatterton", "thomasreads", "64K"]].map(([name, handle, followers], index) => <div key={name} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full text-xs font-semibold text-white" style={{backgroundColor: ["#d39c3d", "#536c61", "#586d80"][index]}}>{name.split(" ").map((word) => word[0]).join("")}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{name}</strong><span className="block truncate text-xs text-[var(--muted)]">@{handle}</span><span className="text-xs text-[var(--muted)]">{followers} followers</span></span><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium text-[var(--accent)]">Follow</button></div>)}</div></section>;
}

function ActivityPanel() {
  return <section className="rail-card"><div className="flex items-center justify-between"><h2 className="rail-title">Recent Activity</h2><Icon name="pulse" className="h-5 w-5 text-[var(--accent)]"/></div><div className="mt-6 space-y-5">{[["heart", "Liked a post", "2h"], ["comment", "Replied to a post", "5h"], ["bookmark", "Saved a book", "1d"], ["heart", "Liked a post", "2d"], ["comment", "Replied to a post", "3d"]].map(([icon, text, time], index) => <div key={`${text}-${time}`} className="flex items-center gap-3"><Icon name={icon as "heart" | "comment" | "bookmark"} className={`h-5 w-5 ${index === 0 || index === 3 ? "text-[var(--coral)]" : "text-[var(--ink)]"}`}/><span className="flex-1 text-sm">{text}</span><span className="text-xs text-[var(--muted)]">{time}</span></div>)}</div><button className="mx-auto mt-8 block text-sm font-medium text-[var(--accent)]">View all activity</button></section>;
}

export function RightRail() {
  const pathname = usePathname();
  return <div className="space-y-5"><RailSearch/>{pathname === "/explore" ? <><TrendingPanel/><SuggestedPeople/></> : pathname === "/profile" ? <><TastePanel/><ActivityPanel/></> : <TastePanel compact/>}</div>;
}
