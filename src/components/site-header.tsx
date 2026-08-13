"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Plans" },
  { href: "/plans/new", label: "New plan" },
  { href: "/routines", label: "In Hevy" },
  { href: "/records", label: "Records" },
  { href: "/settings", label: "Settings" },
];

// A client component only so the current route can be marked. Everything else
// here would render fine on the server.
//
// `trailing` is a slot, not a rendered value: the layout passes the async
// SessionBadge server component through it. A client component cannot import a
// server one, but it can render one handed to it as a child — which is what
// keeps the cookie read on the server and out of this bundle.
export function SiteHeader({ trailing }: { trailing?: ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="ui-topbar">
      <nav className="mx-auto flex w-full max-w-5xl items-center gap-8 px-8">
        <Link href="/" className="ui-brand">
          <span className="ui-brand__mark" aria-hidden="true" />
          Hevy Planner
        </Link>

        <ul className="flex items-center gap-7">
          {NAV.map((item) => {
            // "/" would otherwise prefix-match every route.
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`ui-navlink${isActive ? " ui-navlink--active" : ""}`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <span className="ml-auto hidden sm:inline-flex">{trailing}</span>
      </nav>
    </header>
  );
}
