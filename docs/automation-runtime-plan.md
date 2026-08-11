# Plan: Shared Automation Runtime

Status: **proposed / not started**. This is the shared prerequisite for the
calendar, Pomodoro, and local-network-presence plans.

## Goal

Build one Rust-owned runtime for local automations so every trigger uses the same
safe lifecycle instead of independently implementing background tasks, light
ownership, snapshots, crash recovery, conflicts, tray behavior, and
notifications.

## Existing foundation

PC Sync already has capture/restore behavior in
`src-tauri/src/services/entertainment/snapshot.rs`. Extract the reusable light
state operations without changing completed PC Sync behavior or its tests.

## Runtime responsibilities

- Persist rule definitions and runtime journals locally; keep secrets in the OS
  keychain and non-secret structured data in SQLite or the Tauri store.
- Run schedules and detection in Rust using monotonic timing where appropriate;
  webview timers are presentation only.
- Resolve room/zone targets to deduplicated Hue v2 light IDs before ownership.
- Capture power, brightness, color mode, XY/mirek, and supported effects before
  the first write. Pace per-light writes and avoid redundant properties.
- Maintain an ownership/priority policy across PC Sync, calendar, Pomodoro, and
  presence actions. Never silently fight an externally controlled entertainment
  session.
- Support layered snapshots when one app-owned automation temporarily supersedes
  another. Restore only state the runtime owns.
- Journal ownership and restoration before writes. On stop, exit, reconnect, or
  startup recovery, retry restoration and clear the journal only after success.
- Provide one command/event API for start, pause, resume, stop, status, recovery,
  and user-visible errors.
- Provide shared tray/autostart integration and native notifications, with
  feature-specific wording supplied by each consumer.
- Redact secrets and sensitive event content from logs and telemetry.

## Delivery order

1. Extract and test the shared Hue snapshot/restore service while keeping PC Sync
   behavior unchanged.
2. Add the ownership coordinator, priority policy, layered snapshots, and
   crash-safe journal.
3. Add the task scheduler, command/event surface, tray lifecycle, autostart, and
   notification adapter.
4. Migrate one consumer end to end (Pomodoro is the smallest), then calendar and
   presence.

Backend state/runtime work and frontend interaction work should be delivered as
separate tasks.

## Acceptance criteria

- Only one component owns a light-changing automation at a time according to a
  documented priority decision.
- Normal stop, app exit, crash recovery, and bridge reconnection restore owned
  state without deleting a failed recovery journal.
- Calendar, Pomodoro, and presence contain no independent snapshot or tray
  implementations.
- PC Sync regression tests remain green after extraction.

## Decisions still required

- Final priority order and whether a user can override it per rule.
- SQLite versus Tauri store for automation/rule data.
- Whether closing the window keeps the process in the tray by default; startup
  onboarding must explain whichever behavior is selected.
