# Plan: Multi-Bridge Dashboard and PC Sync

Status: **future / not started**. Last reviewed: **2026-08-12**.

## Current behavior

Mote Desktop can pair and retain multiple Hue Bridges, but one bridge is active
at a time. Switching bridges reloads the app's Hue resources and restarts its
event stream. Any active PC Sync session is stopped before the switch.

This is sufficient for the first release. The limitations tracked here are:

1. There is no combined dashboard or simultaneous control spanning multiple
   paired bridges.
2. PC Sync cannot remain active on one bridge while the user switches to
   another, and it cannot stream to entertainment areas on multiple bridges.

Per-bridge HDMI Sync Box ownership is separate work in
[per-bridge-sync-box-plan.md](./per-bridge-sync-box-plan.md).

## Goals

- Let users view and control resources from more than one bridge without
  repeatedly switching the entire application context.
- Preserve clear bridge and Home ownership for every resource and command.
- Allow PC Sync behavior across bridge switches without sending data to the
  wrong bridge or entertainment area.
- Keep partial failures isolated: an offline bridge must not make other bridges
  unusable.

## Workstream 1: Combined multi-bridge experience

- Add a combined Home/dashboard mode alongside the existing single-active-
  bridge view.
- Namespace cached resources and frontend keys by bridge ID so identical Hue
  resource UUIDs, loading states, errors, and optimistic updates cannot collide.
- Maintain one authenticated transport and event-stream lifecycle per connected
  bridge, with bounded concurrency and independent reconnect/backoff state.
- Route every command using the resource's owning bridge ID rather than a
  process-wide active bridge.
- Show bridge/Home affiliation in search, selectors, widgets, scenes, and error
  messages where ambiguity is possible.
- Support bridge-scoped and cross-bridge actions, with an explicit result for
  each bridge when only part of a group action succeeds.
- Define whether rooms/zones remain strictly bridge-owned or can be presented
  inside app-level groups spanning bridges.

## Workstream 2: PC Sync across bridge switches

First choose and document the intended product behavior:

- **Background-session option:** PC Sync continues on Bridge A while the user
  browses or controls Bridge B.
- **Multi-bridge option:** one capture/analyzer pipeline can feed selected
  entertainment areas on multiple bridges concurrently.
- **Resume option:** switching stops the stream safely but offers an explicit
  resume action when the user returns to that bridge.

Implementation requirements for either background or multi-bridge sessions:

- Replace the single global host-sync session with bridge-keyed sessions.
- Associate every selected entertainment area, credential, DTLS connection,
  status, and error with its bridge ID.
- Share screen/audio capture and analysis where possible, then fan out bounded
  bridge-specific streams rather than duplicating expensive capture work.
- Define CPU/network/session limits and reject or degrade gracefully when the
  machine or Hue hardware cannot sustain all requested streams.
- Make Stop controls unambiguous: stop one bridge, one area, or all PC Sync
  sessions.
- Ensure removing a bridge, resetting credentials, sleeping, changing display
  topology, or exiting Mote Desktop terminates only the appropriate sessions.

## Suggested phases

1. Add bridge ownership to frontend resource keys and command inputs while
   retaining the current active-bridge UI.
2. Introduce independent per-bridge loading, errors, and Hue event streams.
3. Ship an opt-in combined dashboard with bridge-scoped controls.
4. Refactor PC Sync into bridge-keyed sessions and implement the selected
   background/resume behavior.
5. Evaluate simultaneous multi-bridge PC Sync after profiling capture, DTLS,
   bridge capacity, and recovery behavior.

## Acceptance criteria

- Two paired bridges can appear in one dashboard and be controlled without a
  full application-context switch.
- A disconnected bridge reports its own failure while the other bridge remains
  responsive.
- Events and optimistic updates never mutate a resource belonging to another
  bridge.
- PC Sync behavior during a bridge switch matches the chosen policy and is
  visible to the user before the switch occurs.
- No entertainment stream can use another bridge's application/client key.
- Remove/reset/exit cleanup leaves no orphaned PC Sync sessions.
- Multi-bridge behavior passes clean-start, reconnect, sleep/resume, and
  partial-network-failure tests with two physical bridges.

## Out of scope

- Cloud accounts, shared-home membership, and remote relay; those belong to
  [homes-and-membership-plan.md](./homes-and-membership-plan.md).
- Per-bridge HDMI Sync Box persistence and switching.
- Treating separate Hue Bridges as one native Hue Bridge configuration; any
  cross-bridge grouping is an app-level abstraction.
