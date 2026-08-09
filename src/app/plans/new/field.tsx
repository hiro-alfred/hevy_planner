import type { ReactNode } from "react";

// Field furniture shared by the training fields and the optional profile
// fields. It lives in its own module because plan-form.tsx imports
// profile-fields.tsx — exporting these from either one would make the pair
// circular.

export const LABEL_CLASSES = "ui-label";

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className={LABEL_CLASSES}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ui-faint">{hint}</p>}
    </div>
  );
}

/**
 * Divider and title for a block of fields.
 *
 * `note` is where each optional section states what it buys the user — the
 * fields are skippable, so the form has to earn every one of them rather than
 * just presenting more boxes.
 */
export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-ui-line pt-5">
      <legend className="sr-only">{title}</legend>
      <div className="flex flex-col gap-1">
        <span className={LABEL_CLASSES}>{title}</span>
        {note && <p className="text-xs text-ui-faint">{note}</p>}
      </div>
      {children}
    </fieldset>
  );
}
