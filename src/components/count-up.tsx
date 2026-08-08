"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// useLayoutEffect warns when React runs it during server rendering. There is
// nothing to lay out on the server, so fall back to useEffect there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Number that counts up to its value on mount.
 *
 * The server renders the REAL value, so the markup is correct without JS and
 * hydration matches. The reset to zero happens in a layout effect — before the
 * browser paints — which is what stops the final number flashing on screen and
 * then jumping back to zero on a slow hydrate.
 */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);

  useIsomorphicLayoutEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || value === 0) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    let startedAt = 0;
    setDisplay(0);

    function step(timestamp: number) {
      if (startedAt === 0) startedAt = timestamp;
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      // easeOutExpo: quick climb, long settle — reads as a readout locking on.
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = window.requestAnimationFrame(step);
    }

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [value, duration]);

  // Plain digits, not toLocaleString: the server and the browser can disagree
  // on locale, and that disagreement would be a hydration mismatch.
  return <>{display}</>;
}
