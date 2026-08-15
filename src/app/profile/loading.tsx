// Route-level fallback for /profile.
//
// Four database reads run before this page can render anything, and it is
// force-dynamic like every other route here — so a prefetch delivers the shell
// and nothing else. Same geometry as the real page (hero, identity card,
// gauge card, form card) so nothing moves when the content arrives.
export default function Loading() {
  return (
    <div className="ui-shell">
      <header className="ui-hero">
        <div className="flex w-full flex-col gap-3">
          <div className="ui-skeleton ui-skel-title" />
          <div className="ui-skeleton ui-skel-line max-w-lg" />
        </div>
      </header>
      <div className="ui-skeleton ui-skel-stat" />
      <div className="ui-skeleton ui-skel-card" />
      <div className="ui-skeleton ui-skel-card" />
    </div>
  );
}
