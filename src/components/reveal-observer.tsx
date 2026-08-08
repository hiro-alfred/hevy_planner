"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Reveals every `.reveal` element as it scrolls into view.
 *
 * Mounted once in the layout and driven by a document-wide query rather than a
 * wrapper component, so server components can opt in with a class name alone —
 * no client boundary is pushed down into the page tree just to animate.
 *
 * Re-runs on navigation: App Router swaps the tree without remounting the
 * layout, so a pathname-keyed effect is what picks up the new page's elements.
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(".reveal:not(.is-visible)"),
    );
    if (targets.length === 0) return;

    const show = (element: Element) => element.classList.add("is-visible");

    if (!("IntersectionObserver" in window)) {
      targets.forEach(show);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -8% 0px" },
    );

    targets.forEach((target) => observer.observe(target));

    // Safety net. Content that is hidden until it intersects must never stay
    // hidden because of a missed callback — after this timeout, show everything
    // regardless. A late reveal is a cosmetic miss; an invisible page is not.
    const failsafe = window.setTimeout(() => targets.forEach(show), 1600);

    return () => {
      window.clearTimeout(failsafe);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
