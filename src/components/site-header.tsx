"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StatusChip } from "@/components/status-chip";

const NAV = [
  { href: "/", label: "Plans" },
  { href: "/plans/new", label: "New plan" },
  { href: "/settings", label: "Settings" },
];

// A client component only so the current route can be marked. Everything else
// here would render fine on the server.
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="hud-topbar">
      <nav className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-3">
        <Link href="/" className="hud-flicker flex items-baseline gap-2">
          <span className="hud-mono text-sm font-semibold tracking-[0.2em] uppercase">
            Hevy
          </span>
          <span className="hud-mono text-sm tracking-[0.2em] text-hud-cyan uppercase">
            Planner
          </span>
        </Link>

        <ul className="flex items-center gap-5">
          {NAV.map((item) => {
            // "/" would otherwise prefix-match every route.
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`hud-navlink${isActive ? " hud-navlink--active" : ""}`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <span className="ml-auto hidden sm:inline-flex">
          <StatusChip tone="live" pulse>
            Online
          </StatusChip>
        </span>
      </nav>
    </header>
  );
}
