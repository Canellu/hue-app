# Plan: Monetization & Backend Stack (Paywall, Auth, Database)

Status: **vision / not started**. This is the decision doc for the concrete
technology stack behind the future backend, plus how we **charge money**. It
answers the questions the other two plans deliberately deferred:

- [homes-and-membership-plan.md](./homes-and-membership-plan.md) defines the
  *what* — app identity, homes, members, roles, relay — and explicitly leaves
  open *"Identity provider: roll our own accounts, or federate?"*. **This doc
  answers that.**
- [cloud-control-plan.md](./cloud-control-plan.md) defines the **device
  transport** (local bridge vs Hue cloud) and the stateless **token broker**.
  **This doc does not change either**; it decides what hosts them.

Scope here: **auth provider, database, "is there a backend," and the paywall.**
Not scoped here: the homes/membership data model (owned by the membership plan)
or the Hue OAuth handshake (owned by the cloud-control plan).

> **Launch target: the Microsoft Store (Windows) first.** We ship to a single
> storefront initially, which adds one hard constraint this doc must satisfy:
> Microsoft Store policy governs how we may charge. See
> [Windows Store policy compliance](#windows-store-policy-compliance-launch-target)
> below — it constrains the payment-provider and Pro-tier sections, and is the
> reason the Pro tier's "local depth, no backend" story changes for Store builds.

## The three questions, answered up front

| Question | Answer | Why |
|---|---|---|
| **Do we need a backend?** | **Yes — for paywall + pillars 3-4.** Not for pillars 1-2. | A paywall's entitlement check *must* be server-side; the client can't be trusted. Same server the membership plan already calls for. |
| **Auth / user management?** | **Clerk** (federated: Google / Apple / Hue → our user). | Answers the membership plan's open question. Don't roll our own auth. |
| **Database / backend runtime?** | **Convex** (database **and** functions **and** realtime, with first-class Clerk integration). | Convex *is* the backend — it subsumes the DB, the server functions, and can host the relay. One system, not three. |

The headline: **Convex is the "backend" the membership plan keeps referring to.**
We do not separately stand up Postgres + an API server + a websocket layer.
Clerk owns identity, Convex owns everything stateful, payments bolt on via
webhook.

## Recommended stack

```
┌──────────────────────────┐
│  hue-app (Tauri webview)  │
│  - Clerk session (JWT)    │
│  - Convex client (WS)     │
│  - reads entitlements     │
└───────┬───────────┬───────┘
        │           │
   Clerk JWT        │ Convex client (realtime queries/mutations)
        ▼           ▼
┌────────────┐  ┌─────────────────────────────────────────────┐
│  Clerk     │  │  Convex (the backend)                        │
│  - identity│─▶│  - users (mirror of Clerk id)               │
│  - federate│  │  - homes / memberships / roles  ◄── membership-plan model
│  - JWT     │  │  - owner Hue tokens (relay credential)      │
└────────────┘  │  - subscriptions / entitlements             │
                │  - actions: token broker + guest relay      │──▶ api.meethue.com
                └───────────────────────┬─────────────────────┘
                                        ▲ webhook
                              ┌─────────┴──────────┐
                              │ Payment provider   │
                              │ (Stripe / Paddle…) │
                              └────────────────────┘
```

- **Clerk** = pillar 1 (app-native identity). Federate "Sign in with
  Google/Apple/Hue" into a single stable principal; we keep only a thin user
  record. Clerk issues a JWT that Convex verifies natively.
- **Convex** = pillars 3-4 storage + logic. The homes/membership schema from the
  membership plan lives here. **Convex actions** (server functions that can call
  external APIs and hold secrets in env vars) can host both the **token broker**
  and the **guest relay**, so the separate Vercel function becomes optional.
- **Payment provider** writes subscription state into Convex via webhook; the
  client only *reads* entitlements.

### Why Clerk over rolling our own

The membership plan's pillar 1 needs "a stable entity that can belong to
multiple homes," ideally via federation. That is exactly Clerk's job. Rolling our
own means owning password resets, OAuth federation, session security, MFA, and
breach liability — for a side feature. Clerk gives federated sign-in, a verified
JWT Convex consumes directly, and (optionally) **Clerk Billing** which can cover
the paywall too (see below). Alternatives if Clerk disappoints: Auth0, Supabase
Auth, WorkOS — same shape, swap later.

### Why Convex over "a database"

The instinct "Clerk for auth, then what database?" assumes we still hand-build an
API server. Convex collapses that: you write TypeScript query/mutation/action
functions that run server-side against a built-in document database, and the
client subscribes to queries that **push updates in realtime**. That realtime
push is a direct fit for the membership plan's **auto-recognition** ("the homes
they've been added to simply appear") and for live light state. Convex verifies
Clerk JWTs out of the box, so auth → data is wired with no glue server.

Alternatives considered: **Supabase** (Postgres + RLS + realtime — pick this if
you'd rather own raw SQL and might outgrow a document model); a hand-rolled
**Node/Hono API on Vercel + Neon Postgres** (most control, most plumbing). Convex
wins on *least code to a working stateful + realtime backend*, which is the right
optimization for a small team shipping a side platform.

## Does this retire the Vercel token broker?

Maybe — and that's a feature. The cloud-control plan's broker exists only to hold
`client_secret` and swap codes for tokens. A **Convex action** with the secret in
an env var does the same thing. So:

- **If we adopt Convex anyway** (we will, for pillars 3-4): fold the broker into a
  Convex action and **delete the separate Vercel project**. One backend.
- **Before Convex exists** (Phase 1, local-only): keep the standalone stateless
  Vercel broker exactly as the cloud-control plan specifies. It ships value with
  zero accounts/DB. Convex absorbs it later.

The **guest relay** from the membership plan ("app→our-backend→Hue using the
owner's stored credential") is likewise a Convex action reading the owner's
refresh token from the Convex DB. Broker and relay are the same shape; both are
just Convex actions once Convex is in.

## What we actually paywall

A "charge only for what costs us to serve" model under-monetizes: it gives away
the local app's craftsmanship — which is most of the build effort — to exactly the
users who value it most, the local-first ones who may never want cloud. So we
split **three** ways, not two:

| Tier | Gets | Pricing | Enforcement |
|---|---|---|---|
| **Free** | Basic local control (discovery, pairing, on/off, brightness, basic scenes) — the acquisition funnel | Free | None |
| **Pro** | Full **local** craftsmanship (scene gallery, dynamic-scene speed, themes, multi-bridge local homes, automations) **+ personal remote control** (your account, your bridges, from anywhere) | **One-time purchase** | **Offline signed license** (see below) |
| **Household** | **Shared homes**: members, roles, invites, guest **relay**, auto-recognition | One-time **or** thin subscription | **Server-side** (Convex entitlement) |

### Why remote control is *not* a subscription

The obvious-looking move — "subscription for cloud/remote" — is a trap, for two
reasons:

- **Philips Hue already does remote control for free.** Charging a recurring fee
  for the exact thing the official Hue app gives away is a losing pitch; few would
  pay, and we'd look worse than the free baseline.
- **Single-user remote doesn't actually cost us anything recurring.** Per
  [cloud-control-plan.md](./cloud-control-plan.md), normal light traffic goes
  *straight from the app to `api.meethue.com`* on the user's own token; our broker
  is **stateless** and only touches token exchange/refresh (rare). There is no
  per-month cost to fund, so there's nothing to put a subscription against.

So **personal remote control belongs in the one-time Pro tier**, where it competes
with Hue's free remote on *app quality*, sold once — not on charging for
connectivity Hue gives away.

The **only** feature with genuine recurring cost is the **guest relay** in shared
homes: members with no Hue account of their own, whose commands route
`app → our backend → Hue` on the owner's credential and consume our shared Hue
rate-limit budget. That — and only that — is what a recurring price could
legitimately map to. Even then it can be sold one-time and the modest relay cost
absorbed as cost-of-goods (see pricing below).

Why this shape holds together:

- **Tiers are orthogonal.** A local-first user who never wants sharing **pays once
  (Pro) and owns the good app forever**, including personal remote. A household
  adds the Household tier on top. Neither forces the other.
- **Pricing matches cost.** Pro carries no recurring infra → one-time. Household's
  relay is the one ongoing cost → priced one-time *or* as a thin subscription.

Keep Free genuinely useful — it's the funnel, not a crippled demo. The line
between Free and Pro is a product decision (which local features are "depth"); the
list above is a starting cut.

## Price points & bundling

Reference: third-party Hue apps cluster at one-time **$3–$10** (iConnectHue, Hue
Essentials); a polished *desktop* app can sit higher, **$20–$30 one-time**. Three
bundlings, recommendation first.

### Bundle A — One-time only (recommended)

| Tier | Price | Gets |
|---|---|---|
| Free | $0 | Basic local control (funnel) |
| **Pro** | **$24.99 one-time** (launch $14.99) | Full local depth **+ personal remote control** |
| **Household** | **$49.99 one-time** (or +$25 upgrade from Pro) | Shared homes, members/roles, invites, guest relay, auto-recognition. Cap ~5 members. |

We absorb the modest relay cost as cost-of-goods. Cleanest sell, zero subscription
resistance, "buy once, own forever" — what local-first Hue users want.

### Bundle B — One-time + thin subscription for the costly bit

| Tier | Price | Gets |
|---|---|---|
| Free | $0 | Basic local |
| **Pro** | **$24.99 one-time** | Local depth + personal remote |
| **Household** | **$2.99/mo or $24.99/yr** | Shared homes + guest relay (the one true recurring cost) |

Subscription scoped to exactly the feature that costs us monthly, and only
households (multi-person) ever see it. Lead with annual.

### Bundle C — Pro subscription (not recommended)

Everything premium behind ~$3–5/mo. Against free official remote control this is
the model most likely to flop; documented here only to be explicitly rejected.

**Recommendation: ship Bundle A.** It maximizes conversion and respects the
local-first user. Keep Bundle B as the fallback if relay costs actually bite at
scale — it requires no model change, only flipping Household from one-time to
subscription (both are just a Convex entitlement).

## Enforcing a *local* paywall (offline licensing)

The Cloud tier is easy to enforce: those features run through our infra, so the
server-side entitlement check in "Paywall mechanics" below already gates them. The
**Pro tier is the hard part** — its features are purely local and work offline, so
**there is no server in the request path to check anything.** A client-side
`isPro` boolean is trivially flipped.

The standard answer for paid offline desktop software is a **cryptographically
signed license key**, verified locally:

- On purchase, the payment provider issues a license key bound to the buyer
  (email/order). The key embeds the tier and is **signed with our private key**.
- The app ships our **public key** and verifies the signature **offline** — no
  network, no account, works forever on a plane. Tampering invalidates the
  signature.
- Optional hardening: a one-time **online activation** that binds the key to a
  device (limits casual sharing) with a generous offline grace period, so we don't
  break the offline promise.

This is inherently crackable — all offline licensing is (Sublime Text, etc.) — and
that's an accepted tradeoff: it stops casual sharing, not determined piracy. Price
fairly and most people pay.

**The payoff: Pro needs no backend.** Lemon Squeezy and Paddle (the Merchant of
Record providers already recommended) both **generate and manage license keys**,
so we can ship a paid local app with **no Clerk, no Convex, no server** — long
before pillars 3-4. See phasing below.

## Paywall mechanics (entitlements)

The non-negotiable rule: **entitlement is decided server-side.** The desktop
binary is extractable (same reasoning that forces the token broker in the
cloud-control plan), so a client-side `isPro` flag is worthless on its own.

```
checkout ─▶ provider ──webhook──▶ Convex: write subscription row
                                        │
client reads `entitlements` query ◄─────┘  (realtime; reflects instantly)
gated server actions (relay, create-home) re-check entitlement before acting
```

- Client *reads* a Convex `entitlements` query for UI gating (show/hide, "Upgrade"
  prompts).
- Every **premium server action** (start a relay, create a shared home, send an
  invite) **re-verifies** entitlement server-side before doing the work. UI gating
  is convenience; the action check is the actual wall.
- Provider webhook is the source of truth for the purchase lifecycle —
  subscription (created / renewed / canceled / payment-failed) **or** one-time
  (order paid / refunded) → updates the Convex row. Same enforcement path either
  way, so Household can be one-time or subscription without code changes.

## Payment provider

Because hue-app is a **desktop app distributed outside the iOS/Android stores**,
we are **not** forced into Apple/Google IAP and their 30% cut — we can use web
checkout. Main axis of choice is **who handles global sales tax / VAT**.

> **Microsoft Store caveat.** Our launch storefront has its *own* commerce policy.
> Web checkout (Stripe / Paddle / Lemon Squeezy) is only allowed if what we sell is
> a **cloud service consumed outside the packaged app**, never a feature bundled in
> the local installer. That requirement reshapes both this section and the Pro tier
> — see [Windows Store policy compliance](#windows-store-policy-compliance-launch-target).

| Provider | Model | Tax/VAT | Notes |
|---|---|---|---|
| **Paddle / Lemon Squeezy** | Merchant of Record | **They handle it** | MoR = they are the seller of record, remit VAT worldwide. Best for a small team selling globally. **Recommended.** |
| **Stripe** (direct) | Payment processor | **You handle it** (or Stripe Tax add-on) | Most flexible/standard, but you own tax compliance. |
| **Clerk Billing** | Stripe-backed, in Clerk | Inherits Stripe | Tightest integration if we're already on Clerk; fewer moving parts; less control than raw Stripe. |
| **RevenueCat** | Subscription layer | Via underlying store | Shines for mobile IAP; less compelling for a desktop/web-checkout app. |

Recommendation: **a Merchant of Record (Paddle or Lemon Squeezy)** so we never
touch international tax remittance. If we prefer to stay all-in-one and accept
owning tax, **Clerk Billing** is the lowest-plumbing path. Either way Convex holds
the entitlement record updated by webhook; the provider is swappable behind that
boundary.

## Windows Store policy compliance (launch target)

We launch on the **Microsoft Store** first, so its commerce policy is a gating
constraint, not an afterthought. Get this wrong and certification rejects the app.

### The strict constraint

Microsoft Store policy prohibits selling **local desktop application features**
(locally packaged widgets, themes, gallery scenes) through third-party payment
processors like Stripe. If the premium code or asset files are bundled inside our
local Tauri installer (`.msi` / `.exe`), Microsoft can **reject or ban** the app
during certification review. Put bluntly: **if the thing we charge for already
sits on disk after install, we may not charge for it with our own checkout.**

### Architectural solution — the hybrid cloud SaaS model

To use Clerk + Stripe (web checkout) legally on the Store *without* paying
Microsoft's native-commerce commission, premium must be a **cloud service the app
syncs**, not a local feature it unlocks:

1. **Zero local premium assets.** No premium widget configurations, JSON
   structures, or scene-rendering logic are statically compiled into the packaged
   Tauri folder. The installer contains only the free app plus the *machinery* to
   fetch premium content — never the content itself.
2. **Web-based checkout.** All Stripe billing, invoicing, and subscription
   activation happen externally in a standard browser window
   (`https://yourwebsite.com`). The desktop app provides only an **external link
   hook** — it never renders a purchase form in-process.
3. **Dynamic asset streaming.** The desktop app is strictly a cloud-sync client.
   After Clerk sign-in it inspects `user.publicMetadata.stripeSubscriptionStatus`;
   if `active`, the React frontend **fetches and streams** the widget/gallery
   assets over HTTPS from our server at runtime. Nothing premium exists on disk
   until an entitled session pulls it.

```
Microsoft Store  ──installs──▶  free app + sync machinery only (no premium assets)
                                       │
user clicks "Upgrade"  ──opens──▶  https://yourwebsite.com  (Stripe checkout, browser)
                                       │ webhook
                              Stripe ──▶ Clerk publicMetadata.stripeSubscriptionStatus = active
                                       │
app reads metadata on sign-in ──active?──▶ stream widgets/scenes over HTTPS at runtime
```

### Tension with the offline-license / "Pro needs no backend" model

This is a **real conflict** the rest of this doc must reconcile, not a footnote.
The Pro tier above is sold as *full local depth that works offline with no
backend*, enforced by an **offline signed license key**. That model is exactly
what the Store policy forbids when distributed through the Store: local premium
assets unlocked by a client-side check, paid for off-platform.

So the offline-license path is **valid for direct/sideloaded distribution but not
for the Store build.** For the Microsoft Store launch, "Pro" must be realized as
the cloud-sync service above — which means the Store build **does** need the
Clerk + Convex/cloud backend earlier than the phasing section's "Pro ships now,
no server" milestone implies. Practical reconciliations:

- **Store = cloud-only premium.** The Store SKU requires sign-in and streams
  premium; the offline signed-license SKU is reserved for a future direct-download
  channel. Cleanest legally, but pulls backend work forward to launch.
- **Free-only on the Store, paid off-Store.** Ship a genuinely useful *free* app
  to the Store purely as an acquisition funnel, and sell Pro only via our website /
  direct download where offline licensing is unconstrained. No backend needed to
  launch, but premium isn't monetizable *inside* the Store listing.

This is an open decision — see the new entry under Open questions. The signed
public key the app ships to *verify* a license is not itself a "premium asset" and
is fine to bundle; the prohibition is on the premium **content/features**, not the
verification machinery.

## How this maps onto the membership plan's phases

This doc adds the stack for the membership plan's phases, plus a **Pro license
milestone that can ship before any of them**.

- **Pro license (shippable now, no backend):** introduce the **Free vs Pro** local
  split and offline signed-license verification, with keys issued by Lemon
  Squeezy/Paddle. **First revenue, zero server** — monetizes the app we already
  built without waiting for Clerk/Convex/cloud. The earliest and lowest-risk
  money milestone. (Local depth only; personal remote joins Pro once Phase 1
  cloud control exists.) **Microsoft Store caveat:** this "no backend, offline
  license" milestone is only compliant for **direct / sideloaded** distribution.
  The Store launch cannot sell locally-bundled depth via web checkout (see
  [Windows Store policy compliance](#windows-store-policy-compliance-launch-target)),
  so the Store build either ships Pro as the cloud-sync service (backend pulled
  forward) or stays free-on-Store with paid Pro sold off-Store.
- **Phase 1-2 (no stateful backend):** unchanged from the other docs — stateless
  Vercel broker for cloud *control transport*. Still no Clerk/Convex. Personal
  remote control lands here and is **bundled into the existing one-time Pro** — no
  new SKU, no subscription, because single-user remote has no recurring cost.
- **Phase 3 (app identity):** introduce **Clerk**. Migrate local sessions to a
  Clerk principal. Stand up **Convex** with the `users` table. Optionally migrate
  Pro entitlement from a bare license key into the Convex `entitlements` model so
  one account carries Pro and Household together.
- **Phase 4 (shared homes + membership):** homes/memberships/owner-tokens land in
  **Convex**; broker + relay become Convex actions; the **Household tier +
  server-side entitlements** ship here, since shared homes + guest relay = exactly
  the features Phase 4 enables (and the only ones with recurring cost).

So revenue lands in two clean steps: **Pro one-time** (now → Phase 1, local depth
then personal remote, no backend or subscription) → **Household** (Phase 4, shared
homes, one-time or thin subscription). Note Pro alone — the local-first buyer who
never wants sharing — never requires Clerk, Convex, or a subscription at all.

## Open questions / decisions

- **Clerk inside a Tauri webview.** Clerk is web-first; in a desktop webview the
  session lives in a custom-scheme deep-link OAuth flow, not a normal browser
  cookie. We already need that exact deep-link plumbing for Hue OAuth
  (`hue-app://`, `tauri-plugin-deep-link`) — **spike Clerk's desktop/native story
  early**; it's the biggest unknown in this stack.
- **Token storage on device.** Clerk session + Hue tokens should live in the OS
  keychain (the cloud-control plan already uses the `keyring` crate), not webview
  localStorage.
- **MoR vs. Stripe-direct** — tax ownership tradeoff above; decide before wiring
  checkout, as it changes the integration. Note MoR also gives us license-key
  management for the Pro tier, which Stripe-direct does not (would need Keygen.sh
  or similar).
- **Where the Free/Pro line sits** — which local features count as "depth" worth
  paying for vs. table-stakes that keep Free useful. Product call; revisit as
  features land.
- **Pro license sharing tolerance** — pure offline keys (best UX, easiest to
  share) vs. one-time online activation binding to a device (harder to share,
  needs occasional connectivity). Lean offline-first given the local ethos.
- **Pro → account migration** — if a Pro buyer later signs in (Phase 3), how their
  offline license maps onto a Clerk/Convex entitlement so they aren't asked to pay
  twice.
- **Convex absorbs the broker, or not** — decide at Phase 3 whether to delete the
  Vercel function or keep it standalone.
- **Free-tier abuse / rate limits.** Hue limits are per `client_id` shared across
  all users (per both other docs); premium relay traffic must be metered so paying
  users don't get throttled by free-tier or abusive load.
- **Refunds / chargebacks / downgrade grace** — webhook handling for the unhappy
  paths, not just `subscription.created`.
- **Store-compliant Pro: cloud-only vs. free-on-Store.** The biggest launch
  decision. Microsoft Store policy forbids selling locally-bundled features via our
  own checkout, which collides with the offline-license "Pro needs no backend"
  model. Either make the Store SKU cloud-sync premium (Clerk + backend at launch)
  or ship free-on-Store and sell Pro off-Store. Decide before submitting to
  certification — see [Windows Store policy compliance](#windows-store-policy-compliance-launch-target).

## Touch list (beyond the other two docs)

The membership plan's "new backend project" **becomes Clerk + Convex** rather than
a hand-built server. Concretely this adds:

- **Convex project** — schema (`users`, `homes`, `memberships`, `subscriptions`,
  owner Hue tokens), query/mutation functions, and actions for token-broker +
  guest relay. Replaces "new backend project (evolution of `/broker`)".
- **Clerk setup** — application, federated providers (Google/Apple/Hue), JWT
  template for Convex.
- **Payment provider** — products/prices, webhook → Convex `subscriptions`.
- `src/context/HueContext.tsx`, `src/types/hue.ts` — Clerk principal + Convex
  client + an `entitlements`/tier on the session (extends the membership plan's
  app-user principal).
- New UI — sign-in (Clerk), an **upgrade/paywall** surface, billing/manage
  subscription, plus the membership plan's home-management screens.
- Tauri — Clerk deep-link auth alongside the Hue `hue-app://` scheme already
  planned in the cloud-control plan.
