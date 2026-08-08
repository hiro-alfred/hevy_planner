---
title: Key handling — how the Hevy API key is stored and never leaked
aliases: [api key, key handling, hevy key, secrets]
tags: [subsystem, security, settings, hevy]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [src/lib/settings.ts, src/lib/hevy/session.ts, src/app/settings/actions.ts, src/app/settings/page.tsx, src/lib/settings.test.ts]
---

# Key handling

The Hevy API key is the only secret this app holds. It is stored **in plaintext**
in the `settings` table — a decision, not an oversight: on a single-user box the
decryption key would sit beside the database, so encryption at rest buys nothing
([[plan-pipeline]]). The protections that actually hold are structural, and they
live in `src/lib/settings.ts`.

## The four barriers

1. **`import "server-only"`** at the top of `settings.ts` and `session.ts`. Any
   client component that transitively imports them fails the build, so the raw
   key physically cannot reach a browser bundle.
2. **Two separate accessors.** `getHevyApiKey()` returns the real key and is for
   server code only; `getHevyKeyStatus()` returns `HevyKeyStatus`
   (`configured` / `last4` / `fromEnv` / `updatedAt`) and is the ONLY shape
   allowed into a React tree. The settings page calls the second, never the first.
3. **Server actions return `ActionState` only** — a status plus a human message.
   `describeError()` in `src/app/settings/actions.ts` rebuilds messages from the
   HTTP status alone, so an API error body can never carry the key back to the UI.
4. **The form input is always empty.** There is nothing to pre-fill, because the
   stored key is never sent to the browser. `type="password"` plus
   `autoComplete="off"` keep it off-screen and out of password managers.

> [!danger] The leak that a rendered-HTML check cannot catch
> The first version's error helper ended with `return error.message`. A key
> containing a newline makes the fetch layer reject the header **with the whole
> key quoted in the exception message**, which then travelled back as an
> `ActionState` and rendered in the browser. Two changes close it, and both
> matter: `normalizeHevyApiKey` rejects any key that is not printable non-space
> ASCII **before** it reaches the fetch layer, and `describeHevyError`
> (`src/lib/hevy/errors.ts`) only ever returns status-derived text or a
> deliberately-authored [[key-handling|UserFacingError]] message — an arbitrary
> `Error.message` is never passed through. That also keeps driver internals
> (file paths, SQL) out of the UI.
>
> Generalise the lesson: a check that greps the happy-path HTML proves nothing
> about error paths. Errors are the leak channel.

## One translator, context-aware

`describeHevyError(error, context, fallback)` is the only place a thrown value
becomes user-visible text. It takes a context because the same status means
different things per call site: 403 on an auth check is a bad key, 403 on a
routine write is the routine cap ([[hevy-sync]]). Conflating them sends the user
to re-check a key that was never the problem.

Verified end-to-end against a running server: with a key stored, the rendered
`/settings` HTML contains the last 4 characters and **zero** occurrences of the
full key.

## Resolution order and the env fallback

`getHevyApiKey()` prefers the **stored** key and falls back to `HEVY_API_KEY`
from the environment, so changing the key in the UI takes effect without a
redeploy. A blank/whitespace env var counts as unset. `clearHevyApiKey()` removes
only the stored row, which re-activates the env fallback — the UI hides the
"Remove stored key" button when the active key came from the environment, since
removing it would do nothing.

> [!danger] The .env file itself is off-limits
> Repo rule ([[wiki-enforcement]] covers the vault half of the rules): the agent
> must NEVER read `.env` by any means. Code reading `process.env.HEVY_API_KEY` at
> runtime is fine; opening the file is not. `.env.example` is the only place env
> vars are documented.

## Settings page surface

`/settings` (dynamic, never cached) shows two cards: the Hevy connection (masked
status, key form, "Test connection", "Remove stored key") and the exercise
catalog (cached count, last refresh, refresh button — see [[catalog-service]]).
`saveHevyKeyAction` validates the submitted key against `GET /v1/user/info`
**before** storing it, so a typo cannot be persisted as a working configuration.
`src/lib/hevy/session.ts` is the single place a `HevyClient` is constructed from
the stored key.
