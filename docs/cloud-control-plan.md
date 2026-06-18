# Plan: Remote (Cloud2Cloud) Light Control

Status: **proposed / not started**. This is a design doc for a future feature, not
a description of existing behavior.

## Goal

Let users control their Hue lights **from anywhere over the internet**, not just
when on the same LAN as the bridge. Today the app is local-only: it discovers the
bridge on the network, pairs via the physical link button, and talks to
`https://<bridge-ip>/clip/v2/...`. Remote control reuses the same Hue API v2 but
routes through Philips' cloud at `https://api.meethue.com/route/...` with an OAuth
bearer token.

Remote control is an **opt-in feature layered on the local-first app**. Local LAN
pairing stays the default fast/offline path; cloud is the "control from away"
add-on and the fallback when local discovery fails.

## Why this shape (decisions already made)

- **Hue does NOT support PKCE.** Their Remote API is a confidential-client OAuth2
  flow requiring a static `client_id` + `client_secret`. Confirmed against the
  documented flow (Basic-auth token endpoint, no `code_challenge`).
- **Therefore a server we operate is mandatory.** The `client_secret` cannot ship
  in the desktop binary — neither the React side nor the Rust side, both compile
  into the distributed app and are extractable. The Tauri "backend" is not a
  backend in the OAuth sense; it runs on the user's machine.
- **Use a minimal stateless token broker, not a full proxy.** The only thing that
  must be server-side is the step that touches the secret (token exchange +
  refresh). Normal light/sensor traffic goes straight from the app to
  `api.meethue.com/route` — our server is not in the hot path, so its uptime only
  affects login/refresh, not everyday control.
- **One Hue app registration serves all users.** `client_id`/`client_secret`
  identify our app, not individual users. Each user logs in with their own Hue
  account and gets their own per-user tokens stored on their device.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────┐
│  Tauri app (user device) │         │  Vercel token broker │
│                          │  code   │  (holds client_secret)│
│  - system browser auth   ├────────►│  POST /api/hue-token  │
│  - deep-link redirect    │ tokens  │  - exchange           │
│  - keychain token store  │◄────────┤  - refresh            │
│  - HueClient transport   │         └──────────┬───────────┘
└───────────┬──────────────┘                    │ Basic(id:secret)
            │                                    ▼
            │ Bearer token + hue-application-key │
            │  GET/PUT/POST clip/v2/...          │
            ▼                                    ▼
   LOCAL: https://<bridge-ip>/...   CLOUD: https://api.meethue.com/route/...
                                            (Philips relays to bridge)
```

### Key integration point

`src-tauri/src/services/hue_client.rs` is the single chokepoint. All four verbs
(`get_v2`, `put_v2`, `post_v2`, `delete_v2`) and `fetch_text` currently hardcode:

- URL: `format!("https://{ip}/clip/v2/resource/{resource}")`
- Auth: `.header("hue-application-key", application_key)`
- TLS: `.danger_accept_invalid_certs(true)` (needed for the bridge's self-signed
  cert; must NOT be used for cloud calls to `api.meethue.com`)

The cloud transport changes only these: base URL becomes
`https://api.meethue.com/route/clip/v2/resource/{resource}`, and an
`Authorization: Bearer <access_token>` header is added alongside the existing
`hue-application-key`. Every higher-level method (`get_lights`, `set_light_state`,
scenes, rooms, zones, settings) is transport-agnostic once this is abstracted.

## Components to build

### 1. Hue app registration (one-time, manual)
- Register at developers.meethue.com → username → "Remote Hue API appids" →
  "Add new Remote Hue API app".
- **Decide the redirect URL before registering — it is fixed at registration.**
  Recommended: a custom URL scheme deep link, e.g. `hue-app://oauth/callback`.
- Record `client_id` / `client_secret` (secret goes only into the broker's env).

> **No domain purchase is needed — for anything.** See "Two URLs, no domain" below.

### Two URLs, no domain

The design has **two distinct URLs** that are easy to conflate. Only the second
lives on Vercel, and neither requires buying a domain.

| | Redirect URL | Token broker URL |
|---|---|---|
| **What** | Where the browser lands after the user approves (the app catches the `code` here) | Where the app sends the `code` to swap it for tokens (the `client_secret` lives here) |
| **Example** | `hue-app://oauth/callback` | `https://<project>.vercel.app/api/hue-token` |
| **Registered with Hue?** | Yes — fixed at registration | No |
| **Needs a domain?** | No (custom scheme) | No (free `*.vercel.app`) |

The **redirect URL** is *not* something Vercel provides. Two ways to do it:

- **Option A (recommended): custom URL scheme deep link**, e.g.
  `hue-app://oauth/callback`. This is not a web address — it's a protocol the OS
  associates with the app, so the browser hands the callback straight to the app
  via `tauri-plugin-deep-link`. Costs nothing, standard for native apps, handled
  entirely inside the app.
- **Option B: an HTTPS redirect** on the broker's free `*.vercel.app` URL that
  bounces the `code` back into the app. Still no domain purchase, but more moving
  parts — only worth it if deep links prove unreliable.

The **token broker URL** is the Vercel function (component 2). It's needed in
both options, because it's where the `client_secret` lives — separate from the
redirect, which only catches the `code`.

### 2. Vercel token broker (~30-line serverless function)
- `POST /api/hue-token` handling two grant types:
  - `authorization_code` → exchange `code` for tokens
  - `refresh_token` → refresh an expired access token
- Adds `Authorization: Basic base64(client_id:client_secret)` and forwards to
  `https://api.meethue.com/v2/oauth2/token`. Returns the JSON token payload.
- `client_id`/`client_secret` in Vercel env vars.
- Hardening: a shared app-secret header the app sends, basic rate limiting,
  reject unknown grant types. It never returns the client secret, but anyone who
  finds the URL can mint tokens against our `client_id`, so lock it down.

### 3. Tauri OAuth flow (Rust + minimal UI)
- **Authorize:** open the system browser to
  `https://api.meethue.com/v2/oauth2/authorize?client_id=...&response_type=code&state=<random>&redirect_uri=hue-app://oauth/callback`.
  Use `@tauri-apps/plugin-opener` (already a dependency) or the shell opener.
- **Redirect capture:** register the `hue-app://` deep-link scheme
  (`tauri-plugin-deep-link`) so the OS hands the callback URL back to the app.
  Verify the `state` param (CSRF) before using the `code`.
- **Token exchange:** Rust sends the `code` to the Vercel broker (doing this from
  Rust, not the webview, avoids CORS and keeps tokens off the JS side).
- **Finalize authorization** (per Hue Cloud2Cloud getting-started), using the
  access token as bearer against the `route` base:
  - `PUT https://api.meethue.com/route/api/0/config` body `{"linkbutton":true}`
  - `POST https://api.meethue.com/route/api` body `{"devicetype":"hue-app#..."}`
    → returns the `username` to use as `hue-application-key` for cloud calls.

### 4. Transport abstraction in `hue_client.rs`
- Introduce a `Transport` notion: `Local { ip }` or `Cloud { access_token }`.
- Centralize URL building + auth headers in one helper used by all four verbs,
  so `get_lights`/`set_light_state`/etc. stay unchanged.
- Only set `danger_accept_invalid_certs(true)` for the local transport; cloud
  uses normal cert validation.
- The cloud SSE event stream also lives under `route` — `new_streaming` /
  `commands/events.rs` will need the same base-URL + bearer treatment if we want
  live updates remotely (can be a later sub-phase; polling works initially).

### 5. Token storage & refresh (Rust, keychain)
- Store `access_token` + `refresh_token` + expiry in the OS keychain via the
  existing `keyring` crate (see `KEYRING_SERVICE`/`KEYRING_ACCOUNT` constants),
  separate entries from the local application key.
- Refresh proactively before `expires_in` (~7 days) using the broker's refresh
  grant. Handle refresh failure by prompting re-login.

### 6. Session model changes
- `HueSession` (Rust `hue_client.rs` + TS `src/context/HueContext.tsx`) gains a
  notion of connection mode, e.g. `mode: "local" | "cloud"` and optional
  `accessToken`. The cloud `hue-application-key` (username from step 3) maps onto
  the existing `application_key` field.
- New Tauri commands paralleling the local ones:
  `start-hue-cloud-auth`, `complete-hue-cloud-auth` (or a deep-link event
  handler), `refresh-hue-cloud-token`, and cloud-aware session
  restore/reset. Existing commands in `commands/mod.rs` / `discovery.rs` either
  branch on transport or gain cloud variants.
- Frontend: an opt-in entry point (Settings → "Enable remote access") that drives
  the browser auth and reflects cloud status, reusing the wizard's
  success/error UI patterns where possible.

## Suggested phasing

1. **Broker + registration** — register the Hue app, deploy the Vercel function,
   verify the full OAuth + finalize handshake end-to-end with a manual token (e.g.
   curl/Postman) before touching the app. De-risks the unknowns first.
2. **Transport abstraction** — refactor `hue_client.rs` to route all four verbs
   through a `Transport`, with local behavior unchanged. Pure refactor, no new
   feature; verify the app still works locally.
3. **OAuth flow in Tauri** — deep-link scheme, browser launch, code→token via
   broker, finalize calls, keychain storage. Get a cloud session established.
4. **Wire cloud into commands/session** — make light/room/scene control work over
   cloud; add the Settings opt-in UI; token refresh.
5. **Remote live updates (optional)** — cloud SSE event stream for real-time state
   instead of polling.

## Open questions / risks

- **Hue app review / rate limits.** Production or higher-volume use may require
  approval; rate limits are per-`client_id` and shared across all users, so be
  conservative with cloud polling.
- **Collective failure mode.** If our credentials are revoked, all users lose
  remote control at once — local control still works, which is why local stays the
  default.
- **Privacy framing.** The broker briefly sees user tokens during
  exchange/refresh; document this.
- **Deep-link reliability across OSes** (Windows is the primary target here;
  macOS/Linux behavior of the scheme handler needs testing).
- **Confirm cloud `route` endpoint shapes** for the finalize calls and SSE against
  current Hue docs before implementing step 3/5.

## Touch list (files likely to change)

- `src-tauri/src/services/hue_client.rs` — transport abstraction, cloud auth,
  token storage, finalize calls.
- `src-tauri/src/commands/mod.rs`, `commands/discovery.rs`, `commands/events.rs` —
  new cloud auth commands; transport-aware session/event handling.
- `src-tauri/Cargo.toml` + `tauri.conf.json` — `tauri-plugin-deep-link`, register
  `hue-app://` scheme.
- `src/context/HueContext.tsx`, `src/types/hue.ts` — `mode` + token in session.
- `src/features/settings-screen/` — "Enable remote access" opt-in UI.
- New repo (or `/broker` folder): the Vercel token-broker function.
