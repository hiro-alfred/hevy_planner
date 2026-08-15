// Route-level fallback for /routines.
//
// This page is the slowest navigation in the app: it calls Hevy live on every
// visit rather than reading a cache, and the routines endpoint caps pageSize at
// 10. Combined with `dynamic = "force-dynamic"`, a prefetch delivers only the
// static shell, so without this file a click paints NOTHING until the round
// trips finish.
//
// The skeleton reuses .ui-shell / .ui-hero, so the real content lands where the
// placeholder stood instead of arriving somewhere else — which is the whole
// reason this is a skeleton and not a centred spinner.
export default function Loading() {
  return (
    <div className="ui-shell">
      <header className="ui-hero">
        <div className="flex w-full flex-col gap-3">
          <div className="ui-skeleton ui-skel-title" />
          <div className="ui-skeleton ui-skel-line max-w-md" />
        </div>
      </header>
      <div className="ui-list">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="ui-skeleton ui-skel-card" />
        ))}
      </div>
    </div>
  );
}
