# Plan index

Last reviewed: **2026-08-11**.

The product name is tentative. Plans use “the app” and placeholders such as
`<APP_NAME>` and `<APP_SCHEME>` rather than treating a working title as final.

## Current status and ownership

| Plan | Status | Owns |
|---|---|---|
| [Microsoft Store release](./microsoft-store-release-plan.md) | Proposed | Windows launch identity, packaging, signing, validation, listing, certification, and operations |
| [Sync Box](./sync-box-plan.md) | Complete | Existing single-Sync-Box implementation record |
| [PC Sync](./pc-sync-plan.md) | Complete for Windows launch | Screen/audio capture and entertainment streaming |
| [Per-bridge Sync Box](./per-bridge-sync-box-plan.md) | Proposed | Multiple Sync Boxes and bridge association |
| [Cloud control](./cloud-control-plan.md) | Proposed | Hue OAuth, token broker, and local/cloud transport |
| [Homes and membership](./homes-and-membership-plan.md) | Vision | Product identity, homes, members, roles, and relay model |
| [Monetization and backend stack](./monetization-and-stack-plan.md) | Vision | Auth/backend/payment choices and entitlements |
| [Feedback, analytics, and legal](./feedback-analytics-and-legal-plan.md) | Proposed | Anonymous telemetry, feedback intake, optional contact email, and legal surfaces |
| [Automation runtime](./automation-runtime-plan.md) | Proposed shared prerequisite | Task ownership, light snapshots, recovery, conflicts, tray execution, and notifications |
| [Calendar integration](./calendar-integration-plan.md) | Proposed | Calendar accounts, event rules, and calendar UX |
| [Pomodoro focus rituals](./pomodoro-focus-rituals-plan.md) | Proposed | Focus-session state machine and UX |
| [Local network presence](./local-network-presence-plan.md) | Proposed | Presence detection and presence-rule UX |

## Boundaries that prevent duplicate work

- Calendar, Pomodoro, and presence rules consume the shared
  [automation runtime](./automation-runtime-plan.md); they do not build separate
  snapshot, restoration, conflict, tray, or notification systems.
- Cloud control owns Hue transport and OAuth. Homes/membership owns the shared
  domain model. Monetization owns identity-provider, backend, commerce, and
  entitlement decisions.
- Sync Box and PC Sync are retained as implementation records. New follow-up
  work belongs in a separate plan rather than reopening their completed scope.
- Feedback email is optional and report-scoped. Automatic analytics and crash
  reporting do not collect names or email addresses.

## Review rule

When implementation changes a completed plan, update its status/current-state
summary. Re-check external policy and provider claims at implementation time;
dates, Store rules, OAuth requirements, pricing, and SaaS capabilities can
change.
