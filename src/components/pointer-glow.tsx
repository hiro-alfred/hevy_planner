"use client";

import { useEffect, useRef } from "react";

/**
 * Glow layer that follows the pointer across the panel it is rendered into.
 *
 * It attaches to its own parentElement rather than taking a ref from above, so
 * a server component (Card, and the plan-day panels) can drop it in as a child
 * and stay a server component — the client boundary is this span alone.
 *
 * The position is written as CSS custom properties on the panel. That is a
 * runtime style property, not an authored inline style: the JSX carries no
 * style attribute, and the gradient itself lives in hud.css.
 */
export function PointerGlow() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const panel = ref.current?.parentElement;
    if (!panel) return;

    // Pointless on touch (no hover) and unwanted under reduced motion.
    const isFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!isFinePointer || reduceMotion) return;

    let frame = 0;
    let clientX = 0;
    let clientY = 0;

    // getBoundingClientRect forces layout, so it runs once per animation frame
    // rather than once per pointermove event.
    function apply() {
      frame = 0;
      const rect = panel!.getBoundingClientRect();
      panel!.style.setProperty("--glow-x", `${clientX - rect.left}px`);
      panel!.style.setProperty("--glow-y", `${clientY - rect.top}px`);
    }

    function onMove(event: PointerEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
      if (frame === 0) frame = window.requestAnimationFrame(apply);
    }

    panel.addEventListener("pointermove", onMove);
    return () => {
      window.cancelAnimationFrame(frame);
      panel.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <span ref={ref} className="hud-panel__glow" aria-hidden="true" />;
}
