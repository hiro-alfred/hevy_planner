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
 * WHY IT ALSO WATCHES FOR NEW NODES. This originally scanned once per pathname
 * change, which was correct only while every route committed its content in the
 * same render as its URL. Adding `loading.tsx` to a route broke that assumption
 * and blanked two whole pages:
 *
 *   - the router commits the loading fallback FIRST, so `usePathname()` already
 *     reports the new route while the DOM holds only skeletons;
 *   - a skeleton carries no `.reveal`, so the scan found nothing;
 *   - when the real content streamed in seconds later it swapped into the
 *     Suspense boundary WITHOUT re-rendering this layout-level component, so
 *     `[pathname]` never changed and the scan never ran again;
 *   - `.reveal` ships at `opacity: 0`, so the page stayed permanently blank
 *     while its non-revealing chrome rendered fine.
 *
 * Neither dropping the empty-list early return nor arming the failsafe
 * unconditionally would have fixed it: both act on the element list captured at
 * scan time, which was empty. The content has to be picked up when it ARRIVES,
 * which is what the MutationObserver below does — and which also covers any
 * future streamed or Suspense-boundaried content for free.
 */

/**
 * Content hidden until it intersects must never stay hidden because of a missed
 * callback. Armed per batch rather than once, because a batch that arrives late
 * needs its own deadline — `/routines` makes several live Hevy calls and
 * routinely lands well past this.
 */
const FAILSAFE_MS = 1600;

export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const show = (element: Element) => element.classList.add("is-visible");
    const timers = new Set<number>();

    // `let`, so the callback can unobserve through the same binding it is
    // assigned to — it cannot fire before the assignment completes.
    let observer: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            show(entry.target);
            observer?.unobserve(entry.target);
          }
        },
        { threshold: 0.05, rootMargin: "0px 0px -8% 0px" },
      );
    }

    /** Observes every not-yet-revealed element inside `root`, including itself. */
    function watch(root: Element | Document) {
      const found: Element[] = [];
      if (root instanceof Element && root.matches(".reveal:not(.is-visible)")) {
        found.push(root);
      }
      found.push(...root.querySelectorAll(".reveal:not(.is-visible)"));
      if (found.length === 0) return;

      const active = observer;
      if (!active) {
        found.forEach(show);
        return;
      }
      found.forEach((element) => active.observe(element));
      timers.add(window.setTimeout(() => found.forEach(show), FAILSAFE_MS));
    }

    // Whatever is already on screen for this route.
    watch(document);

    // Whatever arrives afterwards: a streamed page body replacing a loading
    // skeleton, or any client component that renders `.reveal` content later.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) watch(node as Element);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      mutations.disconnect();
      observer?.disconnect();
    };
  }, [pathname]);

  return null;
}
