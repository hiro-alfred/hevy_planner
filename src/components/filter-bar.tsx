import Link from "next/link";

// Search and filter controls, shared by /routines and /records.
//
// Every control here is a plain GET: chips are links, the search box is a form
// with method="get". So the filter state IS the URL — bookmarkable, shareable,
// undone by the back button, and rendered on the server with no client
// JavaScript at all. A `useState` version of this would be less code and worse.

export interface ChipOption {
  value: string;
  label: string;
  /** Optional tally shown beside the label. */
  count?: number;
}

/**
 * A row of mutually exclusive filter links.
 *
 * `hrefFor` builds each link from the page's own current parameters, so
 * changing the filter keeps the search text and vice versa — losing the other
 * control's state on every click is the classic version of this bug.
 */
export function ChipLinks({
  options,
  active,
  hrefFor,
  label,
}: {
  options: ChipOption[];
  active: string;
  hrefFor: (value: string) => string;
  label: string;
}) {
  return (
    <nav className="ui-toolbar__group" aria-label={label}>
      {options.map((option) => {
        const on = option.value === active;
        return (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={on ? "true" : undefined}
            className={`ui-chip${on ? " ui-chip--on" : ""}`}
          >
            {option.label}
            {option.count !== undefined && <span className="ui-chip__count">{option.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The search box.
 *
 * `hidden` carries the page's other parameters through the submit; without it,
 * searching would silently reset the sort or the filter the user just chose.
 * There is no submit button because Enter submits — but the label stays
 * visible, because a magnifying-glass-only field is a guess.
 */
export function SearchField({
  name = "q",
  value,
  label,
  placeholder,
  hidden = {},
}: {
  name?: string;
  value: string;
  label: string;
  placeholder: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form method="get" className="ui-toolbar__group ui-toolbar__group--search">
      {Object.entries(hidden).map(([key, held]) => (
        <input key={key} type="hidden" name={key} value={held} />
      ))}
      <label htmlFor={name} className="ui-label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="search"
        defaultValue={value}
        placeholder={placeholder}
        className="ui-field max-w-xs"
      />
    </form>
  );
}
