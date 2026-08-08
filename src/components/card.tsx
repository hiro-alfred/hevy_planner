import type { ReactNode } from "react";

// Shared surface for a titled block of page content.
export function Card({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/10 p-5 dark:border-white/15">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium">{title}</h2>
          {description && <p className="text-sm opacity-70">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
