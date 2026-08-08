import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { HudBackdrop } from "@/components/hud-backdrop";
import { RevealObserver } from "@/components/reveal-observer";
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
        {/* Fixed behind everything; both are decoration and render nothing
            into the document flow. */}
        <HudBackdrop />
        <RevealObserver />
        <SiteHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
