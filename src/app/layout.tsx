import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { RevealObserver } from "@/components/reveal-observer";
import { SessionBadge } from "@/components/session-badge";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hevy Planner",
  description: "Build workout plans and sync them to the Hevy training app.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Renders nothing into the document flow — it only toggles a class on
            elements that carry .reveal. */}
        <RevealObserver />
        {/* Suspense keeps the session lookup off the critical path: the nav
            renders immediately and the badge fills in, rather than the whole
            shell waiting on a cookie decrypt. */}
        <SiteHeader
          trailing={
            <Suspense fallback={null}>
              <SessionBadge />
            </Suspense>
          }
        />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
