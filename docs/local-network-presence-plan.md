# Local Network Presence Plan

## Summary

Add an opt-in, serverless presence monitor that tracks multiple phones on the
home LAN.

- Poll enabled phones every 30 seconds using ICMP plus fresh ARP/neighbor
  evidence.
- Consider the household away after every phone has been missing for 10
  continuous minutes.
- Activate a selected Hue scene when the first phone returns.
- Turn off selected rooms/zones when the final phone leaves.
- Support Windows, macOS, and Linux.
- Keep all addresses and state local; no cloud service or network scanning.
- Ship disabled by default.

## Backend and State Logic

Implement this phase independently from the settings UI.

- Add a managed `PresenceService` with one cancellable background task,
  automatically started from persisted settings during Tauri setup.
- Require a private, static IPv4 address for each phone; allow an optional
  per-network MAC address for identity checking.
- Build platform-specific probe adapters:
  - Send an ICMP echo with a one-second timeout.
  - Trigger and inspect the native neighbor table.
  - Accept only actively reachable/recently confirmed entries; reject stale or
    incomplete cache entries.
  - On Windows use IP Helper neighbor state such as `GetIpNetTable2`; implement
    equivalent Linux and macOS adapters.
- A successful ping or fresh neighbor confirmation marks a device seen. If an
  observed MAC differs from the configured MAC, report an address conflict and
  pause departure detection.
- Require two consecutive positive probes before recognizing an arrival.
- Track the last positive observation across all enabled devices. Transition to
  away only after 600 uninterrupted seconds without a positive observation.
- Start in `unknown`: initial detection of someone home does not run the arrival
  scene; initial continued absence may transition to away after 10 minutes.
- Do not count computer suspend, network-interface loss, or large scheduling
  gaps as absence. Resume in a checking state with a fresh grace period.
- Persist stable occupancy and action completion separately from live probe
  timestamps to avoid repeating actions after a normal restart.
- Bind configuration to the paired Hue Bridge ID. A changed or removed bridge
  disables actions until settings are reviewed.

## Hue Actions and Failure Handling

- Resolve selected room/zone UUIDs to their current `grouped_light` IDs when
  executing departure.
- Send v2 grouped-light off commands with command-local transitions and
  one-second pacing.
- Activate the configured static v2 scene on arrival.
- Stop active PC Sync before executing the departure action; suppress an arrival
  scene while PC Sync is actively controlling the lights.
- Continue processing remaining departure targets after a partial failure and
  expose failed targets in status.
- Retry departure once per minute while the home remains away. Retry arrival
  only during the first two minutes after arrival. Cancel retries on the
  opposite occupancy transition.
- Deleted scenes or spaces produce a visible configuration warning rather than
  targeting another resource.

## Storage and IPC Interfaces

Store `presence-settings.json` locally with:

- `schemaVersion: 1`
- Paired `bridgeId`
- Global `enabled`
- Devices: generated ID, display name, static IPv4, optional normalized MAC,
  enabled state
- Optional arrival action containing a static scene UUID
- Optional departure action containing room/zone resource type and UUID pairs

Add these Tauri interfaces:

- `get-presence-settings`
- `set-presence-settings`
- `get-presence-status`
- `probe-presence-device` for testing an unsaved device
- `test-presence-action` for explicitly testing arrival or departure
- `presence-status-changed` event

Status includes overall state, per-device state, detection source, last
checked/seen times, away deadline, pending action, last action, and diagnostic
errors.

## Settings UI

Implement only after the backend phase is complete.

- Add a “Presence” tab under “Your Home.”
- Provide:
  - Master enable switch and live household status
  - Named device add/edit/remove controls
  - IPv4 and optional MAC validation
  - Immediate “Test device” feedback
  - Arrival scene selector
  - Departure room/zone checklist
  - Confirmed test buttons for both light actions
- Explain that the IP needs a router DHCP reservation and that a phone’s private
  Wi-Fi MAC must be copied for this specific network.
- Warn when start-on-login or minimize-to-tray is disabled and link to General
  settings without changing either preference automatically.
- Extend the existing start-on-login implementation to macOS and Linux so the
  warning can be resolved on every supported platform.
- Clearly state that monitoring stops when Hue Desktop exits or the computer
  sleeps.

## Test Plan

- Unit-test the state machine with fake time, probes, and action execution:
  - One and multiple-device arrivals/departures
  - Ten-minute debounce and probe flapping
  - Initial unknown state
  - MAC conflicts
  - Network loss and suspend/resume
  - Configuration changes and restarts
  - Retry cancellation and exactly one stable-transition action
- Test persistence defaults, schema parsing, normalization, bridge binding, and
  invalid private-address input.
- Test each platform adapter for ping success, fresh neighbor success, stale
  entries, unreachable phones, and permission failures.
- Test Hue action pacing, overlapping spaces, missing resources, partial
  failures, PC Sync interaction, and bridge reconnection.
- Verify frontend loading, validation, status events, accessibility, and error
  states.
- Run `bun run build`, Rust unit tests, and `bun tauri build` on Windows, macOS,
  and Linux.

## Assumptions

- Version one supports IPv4 only.
- MAC addresses are optional but recommended.
- The 30-second poll interval and 10-minute departure delay are fixed.
- Time-of-day conditions, notifications, per-person actions, automatic state
  restoration, cloud execution, and future shared-home membership integration
  are out of scope.
- This is best-effort presence detection; it is not a security or safety system.
