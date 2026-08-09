import type { ReactNode } from "react";

/** Shared surface for a titled block of page content. */
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
    <section className="ui-card reveal">
      <div className="ui-card__head">
        <div className="flex flex-col gap-1.5">
          {eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}
          <h2 className="ui-card__title">{title}</h2>
          {description && <p className="ui-sub text-sm">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="ui-card__body">{children}</div>
    </section>
  );
}
