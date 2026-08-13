import type { ReactNode } from "react";
import { LoginArt } from "./art";

/**
 * The split sign-in screen: artwork and welcome on one side, the actual gate on
 * the other.
 *
 * Every branch of the login page renders through this — the Google button, the
 * Hevy-key form and the "not configured" dead end — so a misconfigured server
 * still looks like the same product rather than a bare error card.
 *
 * The heading levels are deliberate: the welcome is the page's <h1> and the
 * panel's title is an <h2> under it, matching how the screen actually reads.
 */
export function LoginShell({
  heading,
  lede,
  children,
}: {
  heading: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <div className="ui-login">
      <div className="ui-login__frame reveal">
        <aside className="ui-login__art">
          <span className="ui-brand ui-login__brand">
            <span className="ui-brand__mark" aria-hidden="true" />
            Hevy Planner
          </span>

          <div className="ui-login__copy">
            <p className="ui-login__kicker">Nice to see you again</p>
            <h1 className="ui-login__title">Welcome back</h1>
            <span className="ui-login__rule" aria-hidden="true" />
            <p className="ui-login__blurb">
              This planner holds a Hevy API key and can write routines to a real account,
              so it is closed to everyone but its owner.
            </p>
          </div>

          <LoginArt />
        </aside>

        <section className="ui-login__panel">
          <div className="ui-login__panel-head">
            <h2 className="ui-login__heading">{heading}</h2>
            <p className="ui-login__lede">{lede}</p>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
