/**
 * An error whose message is written for the user and is safe to display.
 *
 * Everything else is treated as internal: server actions must NOT pass an
 * arbitrary `Error.message` back to the browser. Arbitrary messages can carry
 * values the app never meant to reveal — a key containing a newline makes the
 * fetch layer throw with the whole key embedded in the message, and driver
 * errors carry file paths and SQL. Only messages raised deliberately as this
 * type cross back to the UI.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
