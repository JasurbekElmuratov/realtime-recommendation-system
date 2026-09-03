import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { BookFeedProvider } from "@/providers/bookfeed-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "BookFeed — Read, share, discover",
  description: "A book-centered social feed with transparent personalized recommendations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <BookFeedProvider>
          <AppShell>{children}</AppShell>
        </BookFeedProvider>
      </body>
    </html>
  );
}
