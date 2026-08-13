---
title: App authentication — the gate, and why it fails closed
aliases: [authentication, auth, login, the gate]
tags: [security, auth, design, nextjs]
type: design
created: 2026-08-13
updated: 2026-08-13
sources:
  - src/proxy.ts
  - src/lib/auth/config.ts
  - src/lib/auth/authorize.ts
  - src/lib/auth/session.ts
  - src/lib/auth/guard.ts
  - src/lib/auth/jwt.ts
  - src/lib/auth/google.ts
  - src/lib/auth/hevy-identity.ts
  - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
---

# App authentication

BUILT 2026-08-13. The app had **zero** auth: anyone reaching the port had full
control of a Hevy Pro key and could write routines to a real account. Because
[[hevy-api]] has no DELETE and caps routines, that damage is permanent and can
only be undone by hand in the phone app. This page records the gate that closed
it, and the three decisions inside it that were not obvious.

## Scope: a gate, not multi-tenancy

The app stays **single-user** ([[product-architecture]]). One Hevy key in a
global `settings` table, no `user_id` column, plans and `sync_links` global. So
what was built is a gate plus an **allowlist of permitted identities** — an
allowlist entry grants access to *the* app's data, it does not own a slice of
it. Two addresses on the list share one account and one Hevy key. No `users`
table, and no migration `0003`.

## Why the proxy cannot be the whole answer

Next.js 16 renamed `middleware.ts` to **`proxy.ts`** and moved it to the Node
runtime by default — which is what lets it open an AES-GCM cookie via
[[key-handling]]'s `secret-box` at all. But its own documentation says the
matcher is not enough:

> [!warning] From Next's proxy reference
> Server Functions "are handled as POST requests to the route where they are
> used, so a Proxy matcher that excludes a path will also skip Server Function
> calls on that path", and "a matcher change or a refactor that moves a Server
> Function to a different route can silently remove Proxy coverage."

There is a sharper version of this that the docs only imply. Actions are
dispatched by an **action id in a header**, not by path. `/login` has to be
public. The proxy cannot tell a login submission from any other action POSTed at
`/login`, because the id is opaque to it.

Measured against the real build: Next *does* scope action ids per route — a
settings action id POSTed to `/login` returns `200 {}` and does **not** execute
(an unknown id returns `404 Server action not found`, so the two are
distinguishable). But `server-reference-manifest.json` shows actions imported by
the **root layout** are registered on *every* route including `/login`. Today
that is only the login/logout pair. The day someone imports a mutating action
into the layout, it becomes reachable on a public path.

So: **the proxy is the coarse gate, and every one of the 16 server actions calls
`requireIdentity()` as its first statement.** First statement specifically —
`redirect()` signals by throwing, so a surrounding `try/catch` would swallow the
gate into an error message and let the action continue.

## The three decisions

**1. Refuse to serve when unconfigured.** A missing config is HTTP 503 naming
the missing variables, not an open app. This deliberately breaks the pattern of
the rest of the project: a missing `LLM_API_KEY` degrades to rule-based plans
invisibly ([[plan-generation]]) and a missing `SETTINGS_ENCRYPTION_KEY` stores
the key in plaintext ([[key-handling]]). "Looks healthy while unprotected" is
this repo's signature failure and auth does not get to join it. `AUTH_DISABLED=true`
is the one escape hatch: explicit, refused under `NODE_ENV=production`, not
forwarded by compose, and it paints `AUTH DISABLED` in the header of every page.

**2. A sealed cookie, not a sessions table.** With one user, "sign out
everywhere" is rotating `AUTH_SESSION_SECRET`. A table would have bought
revocation and a device list at the price of a database round trip in front of
every render and action — on the dependency that has been this project's most
fragile. Encrypted rather than signed, because the payload carries an email.

The trap worth remembering: `secret-box`'s `encryptSecret` **returns plaintext
when no key is configured**, which is right for a settings column mid-migration
and catastrophic for a session token — an unkeyed `seal` would mint credentials
anyone could forge. Hence the new key-required `seal`/`open` primitives, and a
dedicated `AUTH_SESSION_SECRET` that is never `SETTINGS_ENCRYPTION_KEY`.

**3. Google, with the Hevy key as a fallback that is named honestly.**

- **Google (implemented, recommended).** Authorization code + PKCE, `id_token`
  verified RS256 against Google's JWKS with `iss`/`aud`/`exp`/`nonce`, plus a
  required `email_verified`. Without that last check any Workspace admin could
  assert the owner's address and the allowlist would wave it through. ~120 lines
  of `node:crypto`, no dependency — the same trade as `scripts/cdp-drive.mjs`.
  The JWKS fetcher is **injected**, so a test generates an RSA keypair and signs
  its own tokens: Google's half is proven in CI without a Google account.
- **Hevy key (implemented, fallback).** Verified against the pinned spec first,
  as [[hevy-api]] has caught it lying before: 14 paths, zero `oauth`/`/token`/
  `securitySchemes` occurrences, an `api-key` header on all 22 authenticated
  operations. **There is no Hevy OAuth.** So this is a shared-secret password
  gate, not identity — anyone holding the key is the owner, and signing out
  cannot revoke it. It is documented that way in the README *and on the login
  page itself*. It earns its place by needing no external setup, which also made
  the whole gate verifiable end to end against a local stand-in.
- **Apple: not started.** Needs a paid Apple Developer account; awaiting the
  owner's confirmation.

> [!note] Consider not running this at all
> Cloudflare Access or Tailscale gives the same protection with zero app code —
> no OAuth client to rotate, no session secret, no allowlist. In-app auth is
> worth it only if the app must be reachable from a plain browser on an
> untrusted network. Recorded in the README so the owner can still choose it.

## Verified

Against a real server (standalone build, throwaway MariaDB, a stand-in Hevy at
`HEVY_API_BASE_URL` — the real account was never touched):

- logged-out `POST` to a server action endpoint → **401 Unauthorized**, no
  `Location`, `cache-control: no-store`. Never a redirect: a 3xx on a mutation
  is ambiguous and some clients replay it as a GET.
- logged-out `GET /settings` → **307** to `/login?next=%2Fsettings`.
- a foreign action id aimed at public `/login` → not executed; the scratch
  `settings` table stayed empty.
- allowlisted key → signed in, landed on the remembered `/settings`, header
  showed the identity and Sign out; a guarded action then ran normally.
- non-allowlisted key (valid, different account) → refused with one generic
  message; the specific reason (`not-allowlisted`) went to the server log only.

361 vitest tests pass, up from 278. Public paths are exactly `/login`,
`/api/auth/callback/google`, `/api/auth/start` — there is deliberately **no**
blanket `/api` exclusion in the matcher, which is the usual way this leaks.
