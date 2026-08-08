import type { ReactNode } from "react";
import { PointerGlow } from "@/components/pointer-glow";

/**
 * Shared surface for a titled block of page content.
 *
 * The glow and scan line are separate elements rather than pseudo-elements
 * because .hud-panel already spends both of its own on the corner brackets.
 */
export function Card({
  title,
  description,
  actions,
  eyebrow,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="hud-panel reveal">
      <PointerGlow />
      <span className="hud-panel__scan" aria-hidden="true" />
      <div className="hud-panel__head">
        <div className="flex flex-col gap-1">
          {eyebrow && <span className="hud-eyebrow">{eyebrow}</span>}
          <h2 className="text-base font-medium tracking-wide">{title}</h2>
          {description && <p className="hud-sub">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="hud-panel__body">{children}</div>
    </section>
  );
}
