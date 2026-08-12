# Plan: Monetization and Backend Stack

Status: **vision / not started**. Last policy review: **2026-08-12**.

This plan owns identity-provider, backend, commerce, licensing, and entitlement
decisions. It does not redefine the domain model in
[homes-and-membership-plan.md](./homes-and-membership-plan.md) or Hue OAuth and
transport in [cloud-control-plan.md](./cloud-control-plan.md).

The working brand is **Mote** and the reserved Microsoft Store title is
**Mote Desktop**. Commercial trademark clearance and the permanent app scheme
remain pending, so use `<APP_SCHEME>` and legal-entity placeholders in
implementation until those decisions are final.

## Decisions

| Area | Current direction | Qualification |
|---|---|---|
| Identity | Clerk federated sign-in | Spike OAuth/deep-link and secure session storage in Tauri first. Do not store sessions in webview `localStorage`. |
| Stateful backend | Convex | Holds users, homes, memberships, roles, entitlements, encrypted owner-token records, and server actions. |
| Hue token broker | Server-side function | Start on Vercel only if cloud control ships before Convex; otherwise use a Convex action. |
| Worldwide payments | Merchant of Record (MoR) | Prefer a provider that handles sales tax/VAT. Re-evaluate Paddle and Lemon Squeezy terms and desktop licensing features before integration. |
| Entitlement source | Provider webhook mirrored into Convex | Server actions re-check entitlements; UI state is not a security boundary. |
| Local/offline Pro | Signed entitlement or license | Verify locally with a bundled public key and use optional device activation; accept that offline licensing deters casual sharing rather than determined cracking. |

Clerk Billing is not the default worldwide-launch recommendation. Its current
limitations include Stripe-only processing, subscriptions only, USD-only
billing, no built-in tax/VAT handling, and no 3DS support. Those constraints are
material for European distribution and must be re-checked if it is reconsidered.

## Architecture

```text
Tauri app
  ├─ Clerk session/JWT ────────────────┐
  ├─ Convex queries and mutations ─────┼─> Convex
  └─ local signed-license verification │    ├─ users/homes/memberships
                                       │    ├─ entitlements
Payment provider ── signed webhook ────┘    └─ broker/relay actions
                                                    │
                                                    └─> Hue cloud
```

- Clerk owns authentication and account recovery; the app keeps only the stable
  provider user ID and necessary profile fields.
- Convex owns state and authorization. Every query/mutation/action checks the
  authenticated principal and home role.
- The payment provider owns checkout and payment data. The app and Convex never
  receive or store card details.
- Hue credentials are separate from payment and analytics data, encrypted at
  rest, access-controlled, and never exposed to guest clients.

## Product tiers (hypothesis, not a launch commitment)

| Tier | Candidate scope | Candidate model |
|---|---|---|
| Free | Useful local discovery, pairing, basic light controls, and basic scenes | Free |
| Pro | Deeper local features, automations, multi-bridge features, and personal remote control | One-time purchase |
| Household | Shared homes, members, roles, invites, and guest relay | One-time with limits or a small subscription if measured recurring cost requires it |

Keep the Free tier useful. Decide the exact feature boundary only after usage
analytics and user research; prices in earlier drafts were unsupported guesses
and are intentionally not treated as decisions here.

Personal remote control should not automatically imply a subscription: normal
Hue traffic can go directly from the app to Hue after brokered token exchange.
The guest relay has genuine ongoing infrastructure and abuse cost, so Household
is the tier where recurring pricing may be defensible.

## Entitlement model

Use a single normalized entitlement record regardless of sales channel:

```text
subject: app user or locally activated installation
product: pro | household
source: microsoft_store | merchant_of_record | manual_grant
state: active | grace | expired | refunded | revoked
validUntil: optional
providerReference: opaque identifier
updatedAt: timestamp
```

- Provider webhooks are verified, idempotent, replay-safe, and the source of
  truth for purchase/refund/subscription events.
- Premium server actions enforce entitlement and role on every call.
- The client may cache an entitlement for offline UX, but cannot use that cache
  to authorize server operations.
- Offline local features use a signed license/entitlement. Never ship a private
  signing key or a reusable commerce API secret in the desktop binary.
- Define refund, chargeback, cancellation, grace-period, restore-purchase, and
  account-migration behavior before accepting money.

## Microsoft Store commerce

The first Partner Center product was created as an **EXE/MSI** listing. That
route supports the planned free first release, but it does not provide Microsoft
Store commerce for later in-app purchases. Unless the Store package/product
route is changed to MSIX in coordination with Partner Center, paid Mote Desktop
releases on this route must use the selected secure third-party/
Merchant-of-Record commerce and licensing design. Revisit this decision before
implementing checkout.

The previous draft incorrectly said Microsoft Store policy forbids third-party
checkout for locally used PC features and therefore requires premium assets to
be streamed from the cloud. Remove that architecture: it is unnecessary and
would undermine offline behavior.

Current Microsoft Store Policy 10.8.1 allows a non-game product on PC devices to
use either a secure third-party purchase API or Microsoft's in-product purchase
API for digital goods or services consumed in the app. When using third-party
commerce, the implementation must meet the current policy requirements,
including:

- identify the commerce provider to users at purchase time;
- authenticate the user before purchase;
- obtain purchase confirmation;
- use a PCI-compliant processor for payment information;
- declare use of a third-party purchase API in Partner Center; and
- comply with all current disclosure, refund, regional, and certification rules.

Policy can change. Re-read the live
[Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies)
before checkout implementation and immediately before submission. Do not infer
that a policy allowing third-party commerce guarantees certification of a
particular UX.

Microsoft Store IAP remains a valid alternative. If supporting both Store and
direct-download sales, normalize both into the entitlement model and provide a
clear restore-purchase flow without asking users to buy twice.

## Privacy and security

- Collect only account/payment metadata needed to authenticate, grant purchases,
  prevent fraud, support users, and meet legal obligations.
- Keep product analytics separate from identity by default. Follow
  [feedback-analytics-and-legal-plan.md](./feedback-analytics-and-legal-plan.md)
  for consent, anonymous telemetry, optional report-scoped email, retention, and
  deletion.
- Verify Clerk/Convex authorization on the server; never trust a tier, role, home
  ID, or user ID supplied by the client.
- Verify webhook signatures against the raw body, reject stale/replayed events,
  and make processing idempotent.
- Store desktop tokens in the OS keychain. Use `<APP_SCHEME>://...` deep links,
  random OAuth state, PKCE where supported, and strict callback validation.
- Rate-limit broker, relay, invite, activation, and restore-purchase endpoints.
- Maintain audit events for membership, entitlement, and credential changes
  without logging tokens, event content, or payment secrets.

## Delivery plan

1. **Policy and provider decision**
   - Decide Store IAP, MoR checkout, or both.
   - Confirm current Store policy, MoR country/tax coverage, refund tools,
     licensing/activation support, fees, and webhook behavior in writing.
2. **Desktop auth spike**
   - Prove system-browser sign-in, `<APP_SCHEME>` callback, OS-keychain session
     restore, sign-out, token refresh, and account switching.
3. **Backend foundation**
   - Configure Clerk JWT validation in Convex.
   - Implement the homes/membership schema and least-privilege authorization.
   - Move the Hue broker into Convex only if doing so simplifies operations.
4. **Commerce and entitlements**
   - Configure products, secure checkout, verified webhooks, normalized
     entitlements, restore purchase, refunds, revocation, and grace periods.
5. **Local/offline licensing**
   - Choose provider-issued licensing only after verifying its current feature
     set; otherwise issue our own signed entitlements server-side.
   - Test clock changes, reinstall, offline launch, device migration, refund, and
     revoked-license behavior.
6. **Household relay**
   - Gate relay operations server-side, add quotas/abuse controls, and measure
     actual recurring cost before choosing subscription pricing.

## Open decisions

- Clerk/Convex versus an alternative after the desktop auth proof.
- Microsoft Store IAP, MoR checkout, or dual-channel commerce.
- MoR provider and whether its licensing supports the desired permanent/offline
  entitlement model.
- Exact Free/Pro/Household boundary and regional pricing.
- Pure offline key versus device activation and the allowed device count.
- How direct-purchase entitlements attach to an account later without exposing
  the buyer's email to analytics.
- Guest-relay quotas, retention, revocation latency, and sustainable pricing.

## Acceptance criteria

- A user can purchase, restore, refund, and migrate an entitlement through every
  supported channel without duplicate charging.
- Offline Pro features work for the documented period without weakening server
  authorization for Household features.
- A modified desktop client cannot grant itself server-backed access.
- Payment data never touches app or backend storage.
- Store submission materials accurately declare the commerce provider and match
  the implemented purchase UX.
- Privacy policy, terms, purchase disclosures, refund terms, and support contact
  are published before checkout is enabled.

## Sources to re-check at implementation

- [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies)
- [Clerk Billing overview](https://clerk.com/docs/guides/billing/overview)
- Current Clerk/Convex integration docs and the selected payment provider's
  official webhook, tax, licensing, and refund documentation.
