"use client";

import { useState } from "react";

import { INTERESTS, type Interest } from "@/types";

export function InterestSelector({ initial, onSave }: { initial: Interest[]; onSave: (interests: Interest[]) => void }) {
  const [selected, setSelected] = useState<Interest[]>(initial);

  const toggle = (interest: Interest) => {
    setSelected((current) => current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest]);
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {INTERESTS.map((interest) => {
          const active = selected.includes(interest);
          return <button key={interest} aria-pressed={active} onClick={() => toggle(interest)} className={`rounded-xl border px-4 py-4 text-left text-sm font-semibold transition-colors ${active ? "border-[var(--accent)] bg-[var(--soft)] text-[var(--accent)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line-strong)]"}`}><span className="mb-3 block text-lg" aria-hidden="true">{active ? "●" : "○"}</span>{interest}</button>;
        })}
      </div>
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted)]">{selected.length} selected · choose at least 3</p>
        <button disabled={selected.length < 3} onClick={() => onSave(selected)} className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Update interests</button>
      </div>
    </div>
  );
}
