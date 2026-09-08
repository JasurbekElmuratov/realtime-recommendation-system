import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "compass"
  | "search"
  | "bookmark"
  | "user"
  | "settings"
  | "pen"
  | "sparkles"
  | "image"
  | "gif"
  | "heart"
  | "comment"
  | "share"
  | "more"
  | "brain"
  | "planet"
  | "history"
  | "leaf"
  | "pulse"
  | "chevron"
  | "code"
  | "close";

export function Icon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconName, React.ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bookmark: <path d="M6 3.5h12v17l-6-4-6 4v-17Z" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    pen: (
      <>
        <path d="m4 20 4.2-1 10.7-10.7a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z" />
        <path d="m14.7 6.9 2.8 2.8" />
      </>
    ),
    sparkles: (
      <>
        <path d="M12 2c.4 4 2 5.6 6 6-4 .4-5.6 2-6 6-.4-4-2-5.6-6-6 4-.4 5.6-2 6-6Z" />
        <path d="M19 14c.2 2.1 1.1 3 3 3-1.9.2-2.8 1.1-3 3-.2-1.9-1.1-2.8-3-3 1.9-.2 2.8-1.1 3-3Z" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m4 17 5-5 4 4 2-2 5 5" />
      </>
    ),
    gif: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M8 10H5v4h3v-2H7M11 10v4M14 14v-4h4M14 12h3" />
      </>
    ),
    heart: (
      <path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    comment: (
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.3 9.2 9.2 0 0 1-3.7-.8L3 21l1.8-4.5A8.5 8.5 0 1 1 21 11.5Z" />
    ),
    share: (
      <>
        <path d="m15 5 5 5-5 5" />
        <path d="M20 10H9a5 5 0 0 0-5 5v3" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    brain: (
      <>
        <path d="M9 4a3 3 0 0 0-5 2.2A3.5 3.5 0 0 0 3 12a3 3 0 0 0 2 5.7A3 3 0 0 0 10 20V4Z" />
        <path d="M15 4a3 3 0 0 1 5 2.2 3.5 3.5 0 0 1 1 5.8 3 3 0 0 1-2 5.7A3 3 0 0 1 14 20V4ZM6 9h4M14 9h4M7 14h3M14 14h3" />
      </>
    ),
    planet: (
      <>
        <circle cx="12" cy="12" r="5" />
        <path d="M3.5 15.5c-1-1.8 2-5 6.8-7.5s9.5-3.3 10.3-1.5c.9 1.8-2 5-6.8 7.5s-9.5 3.3-10.3 1.5Z" />
      </>
    ),
    history: (
      <>
        <path d="M7 3h10M7 21h10M8 3c0 4 2 5 4 7 2-2 4-3 4-7M8 21c0-4 2-5 4-7 2 2 4 3 4 7" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 4c-8 0-13 4-13 10 0 3 2 5 5 5 6 0 8-7 8-15Z" />
        <path d="M4 21c3-6 7-10 13-13" />
      </>
    ),
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    code: (
      <>
        <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />
      </>
    ),
    close: (
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6 6 18" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...common} {...props}>
      {paths[name]}
    </svg>
  );
}

export function BookFeedMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 42 42" aria-hidden="true" className={className}>
      <path
        d="M20 10C15 5 9 4 4 5v25c6 0 11 2 16 7V10Z"
        fill="currentColor"
        opacity=".92"
      />
      <path
        d="M22 10c5-5 11-6 16-5v25c-6 0-11 2-16 7V10Z"
        fill="currentColor"
      />
      <path
        d="M20.7 8C20 4.4 22 1.8 25.5 1c.1 3.8-1.5 6.2-4.8 7Z"
        fill="currentColor"
      />
    </svg>
  );
}
