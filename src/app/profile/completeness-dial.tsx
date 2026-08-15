import type { ProfileCompleteness } from "@/lib/planner/profile-defaults";

/**
 * How much of the standing profile is answered, and what each blank costs.
 *
 * A server component. The arc's fill is a CLASS (`.ui-dial--f0` … `--f8`), not
 * an inline `stroke-dashoffset`, for the same reason the reveal stagger is a
 * class: the project bans inline styles, and there is no SVG exemption. The
 * count is small and fixed, so eight classes is the whole cost.
 *
 * It animates without a line of JavaScript. The card around it already carries
 * `.reveal`, so `RevealObserver` adds `.is-visible` on intersection, and the
 * stylesheet transitions the offset from empty to the class's value off that
 * one class change. Reduced motion zeroes the transition and the arc is simply
 * drawn in place — which is the honest static state anyway.
 *
 * Neutral ink, never the accent: the accent marks the primary action, the
 * active nav item and the current day, and a dial is none of those. A complete
 * profile turns the same green the "ok" status chip uses, which is a palette
 * this app already reads as "done".
 */
export function CompletenessDial({ completeness }: { completeness: ProfileCompleteness }) {
  const { filled, total, percent, items } = completeness;
  const done = filled === total;

  return (
    <div className="ui-profile__gauge">
      <div className="ui-dial-wrap">
        <svg
          className={`ui-dial ui-dial--f${filled}${done ? " ui-dial--done" : ""}`}
          viewBox="0 0 72 72"
          role="img"
          aria-label={`${filled} of ${total} profile answers given`}
        >
          {/* Both circles are rotated so the arc starts at twelve o'clock. */}
          <circle className="ui-dial__track" cx="36" cy="36" r="30" />
          <circle className="ui-dial__value" cx="36" cy="36" r="30" />
        </svg>
        <span className="ui-dial__readout ui-mono" aria-hidden="true">
          {percent}%
        </span>
      </div>

      <ul className="ui-profile__checks">
        {items.map((item) => (
          <li key={item.id} className={`ui-check-row${item.done ? " is-done" : ""}`}>
            <span className="ui-check-row__mark" aria-hidden="true">
              {item.done ? "✓" : "○"}
            </span>
            <span className="min-w-0">
              <span className="ui-check-row__label">{item.label}</span>
              {/* The blanks are the ones worth explaining: an answered field's
                  effect is already happening, while an empty one is a cost the
                  user cannot see. */}
              {!item.done && <span className="ui-check-row__why">{item.changes}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
