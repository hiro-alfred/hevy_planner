/**
 * Decorative artwork behind the sign-in panel's left half.
 *
 * Pure SVG with no text and aria-hidden: it carries no information, so a screen
 * reader announcing "wave, circle, circle" would be noise. Every fill and stroke
 * is a class in ui-login.css rather than a presentation attribute, so the whole
 * illustration re-tints with the theme's accent instead of hard-coding a colour
 * the palette would later drift away from.
 *
 * The viewBox is portrait and the panel is sliced from it, so the composition
 * survives the panel going from a tall column on desktop to a short band above
 * the form on a phone.
 */
export function LoginArt() {
  return (
    <svg
      className="ui-login__art-svg"
      viewBox="0 0 560 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ui-login-canvas-grad" x1="0" y1="0" x2="1" y2="1">
          <stop className="ui-login__stop--base" offset="0" />
          <stop className="ui-login__stop--tint" offset="1" />
        </linearGradient>
        <linearGradient id="ui-login-wave-grad" x1="0" y1="1" x2="1" y2="0">
          <stop className="ui-login__stop--wave-in" offset="0" />
          <stop className="ui-login__stop--wave-out" offset="1" />
        </linearGradient>
        <pattern id="ui-login-grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
          <path className="ui-login__grid-line" d="M40 0H0V40" />
        </pattern>
      </defs>

      <rect className="ui-login__canvas" width="560" height="720" />
      <rect className="ui-login__grid" width="560" height="720" />

      <path className="ui-login__ray" d="M-40 560 L400 -40" />
      <path className="ui-login__ray" d="M40 720 L520 100" />

      <path
        className="ui-login__wave ui-login__wave--top"
        d="M0 130 C100 70 180 200 300 160 C400 127 480 60 560 100 L560 -10 L0 -10 Z"
      />
      <path
        className="ui-login__wave ui-login__wave--mid"
        d="M0 470 C110 410 190 540 300 505 C410 470 480 420 560 455 L560 730 L0 730 Z"
      />
      <path
        className="ui-login__wave ui-login__wave--low"
        d="M0 575 C120 520 200 640 320 600 C430 563 490 535 560 560 L560 730 L0 730 Z"
      />

      {/* The same curves again, stroked: the filled bands alone are too faint to
          read as shapes, and the crest line is what makes them look drawn. */}
      <path className="ui-login__crest" d="M0 130 C100 70 180 200 300 160 C400 127 480 60 560 100" />
      <path className="ui-login__crest" d="M0 470 C110 410 190 540 300 505 C410 470 480 420 560 455" />
      <path className="ui-login__crest" d="M0 575 C120 520 200 640 320 600 C430 563 490 535 560 560" />

      <circle className="ui-login__disc" cx="498" cy="78" r="34" />
      <circle className="ui-login__ring" cx="452" cy="132" r="17" />
      <circle className="ui-login__ring" cx="72" cy="196" r="11" />
      <circle className="ui-login__dot" cx="120" cy="330" r="6" />
      <circle className="ui-login__dot" cx="168" cy="286" r="3" />
      <circle className="ui-login__ring" cx="256" cy="628" r="13" />
      <circle className="ui-login__dot" cx="430" cy="668" r="5" />
    </svg>
  );
}

/**
 * Google's "G", drawn rather than loaded: the image lives on a Google CDN, and
 * a login page that fetches a third-party asset before it can render its own
 * button is a needless dependency. Colours are the brand's own, so they are the
 * one place in the app that does not come from the palette.
 */
export function GoogleMark() {
  return (
    <svg className="ui-login__gmark" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        className="ui-login__gmark--blue"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        className="ui-login__gmark--green"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        className="ui-login__gmark--yellow"
        d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"
      />
      <path
        className="ui-login__gmark--red"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
