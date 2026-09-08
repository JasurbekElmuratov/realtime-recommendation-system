"use client";

import { useState } from "react";
import Link from "next/link";

import { InterestSelector } from "@/components/interest-selector";
import { PageHeader } from "@/components/page-header";
import { useBookFeed } from "@/providers/bookfeed-provider";

export default function OnboardingPage() {
  const { interests, setInterests } = useBookFeed();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageHeader
        eyebrow="Cold start"
        title="Shape your first feed"
        description="Pick a few subjects. These become the initial user-interest profile."
      />
      <div className="m-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:m-7 sm:p-7">
        <InterestSelector
          initial={interests}
          onSave={(next) => {
            setInterests(next);
            setSaved(true);
          }}
        />
        {saved && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Interest signals were sent to FastAPI.{" "}
            <Link className="font-semibold underline" href="/home">
              See the new feed
            </Link>
            .
          </div>
        )}
        <p className="mt-8 border-t border-[var(--line)] pt-5 text-xs leading-5 text-[var(--muted)]">
          This profile begins empty. Every selected interest is recorded as a
          real search signal in <code>data/interactions.csv</code>.
        </p>
      </div>
    </>
  );
}
