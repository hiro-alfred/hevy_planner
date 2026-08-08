---
title: Key handling — how the Hevy API key is stored and never leaked
aliases: [api key, key handling, hevy key, secrets]
tags: [subsystem, security, settings, hevy]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [src/lib/settings.ts, src/lib/secret-box.ts, src/lib/hevy/session.ts, src/app/settings/actions.ts, src/app/settings/page.tsx, src/lib/settings.test.ts, src/lib/secret-box.test.ts]
---

# Key handling

The Hevy API key is the only secret this app holds. It is **encrypted at rest**
(AES-256-GCM, `src/lib/secret-box.ts`) and guarded by four structural barriers
in `src/lib/settings.ts` that keep it off the client.

## Encryption at rest

Originally plaintext, on the reasoning that a decryption key sitting beside the
database file buys nothing ([[plan-pipeline]]). [[mariadb-migration]] broke that
premise: dumps, backups and snapshots now travel independently of the host, so a
**database-only compromise became a real and separate event**. That is exactly
the case envelope encryption covers, so the decision was reversed.

- Key from `SETTINGS_ENCRYPTION_KEY`, 32 bytes, base64 or hex. A wrong length is
  rejected rather than padded.
- Stored form is `enc:v1:<iv>:<tag>:<ciphertext>`, all base64. The prefix makes
  plaintext obvious in a dump and makes the upgrade path detectable.
- The setting key is passed as GCM **additional authenticated data**, so a
  ciphertext cannot be moved between settings rows and still open.
- Only keys in `SECRET_KEYS` are encrypted; `weight_unit` stays readable on
  purpose.
- **Non-destructive upgrade.** A plaintext row still decrypts (it is returned
  as-is), and `migrateSecretsToEncrypted()` runs at boot from
  `src/instrumentation.ts` to re-encrypt it, preserving `updated_at` — the value
  did not change, only its representation.

> [!warning] What this does NOT protect
> The encryption key lives in the app host's environment, so anyone who owns
> that host has both halves. This defends the database leaving the host, nothing
> more. Claiming otherwise would be theatre — the same objection that justified
> plaintext originally, now correctly scoped rather than dismissed.

> [!note] Why not hash it
> A password is only ever *verified*, so it can be hashed. This key must be
> *replayed* to Hevy on every request, so it has to be reversible. bcrypt/argon2
> are simply not applicable to third-party credentials.

Losing or rotating the key does not crash the app: `getHevyKeyStatus()` reports
`undecryptable: true`, distinct from "not configured", and the settings page
says "Stored but unreadable" so the user re-enters rather than hunting for a key
that is sitting right there. `getHevyApiKey()` logs and falls back to the env
value instead of throwing on every page that checks for a key.

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
