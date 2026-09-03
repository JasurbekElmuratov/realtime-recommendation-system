"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BookFeedMark, Icon, type IconName } from "@/components/icons";
import { RightRail } from "@/components/right-rail";
import { useBookFeed } from "@/providers/bookfeed-provider";

const NAVIGATION: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/explore", label: "Explore", icon: "compass" },
  { href: "/saved", label: "Saved", icon: "bookmark" },
  { href: "/create", label: "Create", icon: "pen" },
  { href: "/profile", label: "Profile", icon: "user" },
  { href: "/debug", label: "ML Inspector", icon: "code" },
];

function Brand() {
  return (
    <Link href="/home" className="flex items-center gap-2 text-[var(--accent)]" aria-label="BookFeed home">
      <BookFeedMark className="h-10 w-10" />
      <span className="hidden font-serif text-2xl font-bold tracking-tight text-[var(--ink)] xl:block">BookFeed</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, status } = useBookFeed();

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1450px] lg:grid lg:grid-cols-[94px_minmax(0,800px)] xl:grid-cols-[190px_minmax(0,800px)_360px]">
      <aside className="sticky top-0 hidden h-screen border-r border-[var(--line)] bg-[var(--surface)] lg:flex lg:flex-col lg:items-center lg:px-4 lg:py-6 xl:items-start">
        <Brand />
        <nav className="mt-14 flex w-full flex-col items-center gap-3 xl:items-start" aria-label="Primary navigation">
          {NAVIGATION.map((item) => {
            const active = pathname === item.href;
            const create = item.href === "/create";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex h-13 items-center rounded-xl transition-colors ${create ? "bg-[var(--coral)] text-white hover:bg-[var(--coral-dark)]" : active ? "bg-[var(--soft)] text-[var(--accent)]" : "text-[var(--ink)] hover:bg-[var(--soft)]"} w-13 justify-center xl:w-full xl:justify-start xl:px-4`}
                aria-current={active ? "page" : undefined}
                title={item.label}
              >
                <Icon name={item.icon} className="h-6 w-6 shrink-0" />
                <span className="ml-3 hidden text-sm font-medium xl:block">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/profile" className="relative mt-auto flex items-center gap-3" aria-label={`${user.name}'s profile`}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#3f6155] text-xs font-semibold text-white">MC</span>
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--accent)] xl:left-8" />
          <span className="hidden xl:block"><strong className="block text-sm">{user.name}</strong><span className="text-xs text-[var(--muted)]">@{user.handle}</span></span>
        </Link>
      </aside>

      <main className="min-h-screen min-w-0 bg-[var(--background)] pb-20 lg:pb-0">
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[color:var(--surface-translucent)] px-5 backdrop-blur-md lg:hidden">
          <Brand />
          {status === "refreshing" && <span className="text-xs font-medium text-[var(--accent)]">Updating feed…</span>}
        </div>
        {children}
      </main>

      <aside className="sticky top-0 hidden h-screen overflow-y-auto border-l border-[var(--line)] bg-[var(--surface)] p-7 xl:block">
        <RightRail />
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-[var(--line)] bg-[color:var(--surface-translucent)] px-1 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-md lg:hidden" aria-label="Mobile navigation">
        {NAVIGATION.map((item) => {
          const active = pathname === item.href;
          return <Link key={item.href} href={item.href} className={`mobile-nav-link ${active ? "text-[var(--accent)]" : ""}`}><Icon name={item.icon} className="h-5 w-5"/><span>{item.label === "ML Inspector" ? "Debug" : item.label}</span></Link>;
        })}
      </nav>
    </div>
  );
}

