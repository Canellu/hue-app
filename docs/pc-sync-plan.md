# Plan: PC-Hosted Hue Entertainment Sync

Status: **planned**.

Related plan: [HDMI Sync Box Control](sync-box-plan.md)

## Summary

Add Windows-first light sync driven directly by the PC, without a Sync Box:

- Modes: Video, Games, and Music.
- Unified Sync hub with "This PC" and "Sync Box".
- Entertainment-area, display, and audio-output selection.
- Four intensity presets, effect brightness, optional audio-reactive Video,
  and music palettes.
- Continue syncing while minimized or hidden; stop on explicit Stop or
  application exit.
- Confirm before taking over an area owned by another application.
- Restore pre-sync light state by default, with "keep final colors" and "turn
  off" alternatives.

## Backend And Streaming Engine

- Add a managed `HostSyncEngine` with exactly one active session and lifecycle
  states: `idle`, `starting`, `running`, `stopping`, and `error`.
- Extend bridge pairing to retain the returned entertainment `clientkey`. Store
  the application key and client key in the system keyring.
  - New pairings reuse the normal app credential.
  - Existing installations use an "Enable PC Sync" link-button flow that
    creates a separate entertainment credential without replacing the current
    bridge session.
  - Retrieve and cache `hue-application-id` from `/auth/v1`; use it as the DTLS
    PSK identity.
- Use CLIP v2 to list entertainment configurations and start/stop ownership
  with `action: start|stop`.
- Implement HueStream v2 over DTLS 1.2/UDP port 2100 using vendored OpenSSL,
  restricted to `PSK-AES128-GCM-SHA256`. Encode the 16-byte header, ASCII area
  UUID, and 7-byte RGB payload per channel described by the local
  [migration guide](HUE/migration-guide-to-the-new-hue-api.md#entertainment).
- Maintain a latest-value queue: captured frames are dropped when superseded
  rather than accumulating. Resend the last HueStream frame every 500 ms when
  the source is static.
- Monitor area ownership periodically. If ownership changes externally, stop
  local capture without issuing `action: stop` against the new owner.
- On normal stop, terminate capture/audio workers and DTLS first, release the
  area, then apply the configured stop behavior.
- Snapshot deduplicated member lights before starting. Restore or turn them off
  through paced REST writes capped around 10 light commands per second.
- On application exit, perform bounded best-effort cleanup. Do not
  automatically resume a previous stream after restart or crash.

## Windows Capture And Effects

- Add target-specific dependencies for `windows-capture` 2.x and `wasapi`
  0.23. Use Windows Graphics Capture for monitor frames and WASAPI shared-mode
  loopback for output audio.
- Enumerate displays with stable device names, friendly names, adapter,
  virtual-desktop bounds, resolution, primary state, refresh rate, and HDR
  state.
- Support automatic primary-display tracking or a persisted explicit display.
  Render the actual monitor topology in settings.
- Detect HDR displays, capture 16-bit float frames, and apply adaptive exposure
  plus ACES-style tone mapping before analysis. Use 8-bit capture for SDR.
- Map Hue channel `x` and `z` positions onto the selected display. Sample
  bounded cropped tiles around each channel location, convert sRGB to linear
  RGB, reject letterbox black, and calculate saturation-weighted colors.
- Mode behavior:
  - Video: spatial colors with stronger temporal smoothing and optional
    audio-driven brightness emphasis.
  - Games: the same spatial mapping with lower latency, stronger saturation,
    and faster response.
  - Music: WASAPI loopback, Hann-windowed FFT and RMS/onset analysis; distribute
    frequency bands across channels according to their horizontal positions.
- Intensity presets:
  - Subtle: 20 Hz, heavy smoothing, restrained saturation and brightness
    changes.
  - Moderate: 30 Hz, balanced smoothing.
  - High: 40 Hz, faster response and stronger color separation.
  - Extreme: 50 Hz, minimal smoothing and maximum permitted response.
- Music palettes include built-in spectrum/theme palettes and palettes derived
  from existing Hue scene colors. "Match area channels" is the default channel
  count, with fixed 1/3/5-channel alternatives.
- Audio failure handling:
  - Default-output selection follows Windows default-device changes.
  - Losing an explicitly selected device stops Music with an error.
  - Video continues without audio enhancement and reports a warning.

## IPC, State, And UI

- Add commands:
  - `get-host-sync-overview`
  - `provision-host-sync-credentials`
  - `set-host-sync-preferences`
  - `start-host-sync`
  - `update-host-sync`
  - `stop-host-sync`
  - `get-host-sync-status`
- Add shared serializable types for display/audio sources, preferences, start
  requests, live status, mode, intensity, palette, and stop behavior.
- Emit `host-sync-status` only for lifecycle, ownership, warning, and error
  changes; do not stream frame data to React.
- Extend Hue SSE updates with entertainment configuration `status` and
  `activeStreamerId`.
- Extract entertainment-area membership and active-stream ownership from
  `SyncBoxStore` into a shared `EntertainmentStore`. It becomes the source of
  truth for:
  - Active area and owner: PC, Sync Box, or another application.
  - Synced light IDs and disabled manual controls.
  - Global active-sync banner and takeover flow.
- Routes:
  - `/sync`: unified hub with persisted "This PC" / "Sync Box" selection.
  - `/sync/pc/$areaId`: PC Sync controls.
  - `/sync/box/$areaId`: existing Sync Box controls.
- PC Sync screen:
  - Bridge/area status hero and Start/Stop action.
  - Video, Games, and Music mode cards.
  - Subtle, Moderate, High, and Extreme intensity cards.
  - Effect brightness.
  - Audio-for-effect toggle for Video.
  - Music palette and channel-count controls.
  - Confirmed takeover dialog showing the current owner when known.
- Add a "PC Sync" connection settings tab containing:
  - Entertainment credential status and enable/re-pair action.
  - Display topology, automatic-primary toggle, and explicit display selection.
  - Audio output selection.
  - Default Music palette/channel count.
  - Stop behavior.
- Preserve the existing Sync Box onboarding and controls; they no longer block
  access to PC Sync when no box is configured.

## Delivery Sequence And Tests

1. Implement credentials, application-ID lookup, HueStream encoding, DTLS
   transport, and a hardware-gated solid-color streaming spike. Physical-light
   testing requires explicit user confirmation.
2. Implement the engine lifecycle, ownership protection, snapshots, cleanup,
   and mocked bridge/transport tests.
3. Implement Windows display capture, HDR processing, channel mapping, then
   audio capture and Music analysis.
4. Add IPC and the shared entertainment state store.
5. Build the unified hub and PC Sync UI in a separate frontend task from the
   core state/streaming work.
6. Add settings, error states, accessibility, and final hardware validation.

Automated coverage:

- Exact HueStream byte fixtures, sequence rollover, UUID encoding, RGB bounds,
  and 1-20 channels.
- Credential migration, missing key, invalid key, and keyring cleanup.
- Single-session enforcement, idempotent stop, failed start rollback, ownership
  loss, confirmed/declined takeover, bridge loss, and exit cleanup.
- Channel-position mapping, black-bar rejection, HDR tone mapping, smoothing
  presets, and deterministic color fixtures.
- FFT band allocation, silence, clipping, onset response, and device-loss
  behavior.
- Entertainment store ownership and synced-light derivation for PC, Sync Box,
  and external applications.
- Frontend typecheck/build and route/control-state tests.

Manual acceptance:

- Single- and multi-monitor layouts, primary-display changes, negative monitor
  coordinates, hot unplug, SDR, and HDR.
- Default and explicit audio outputs, silence, device switching, and Music
  response.
- Minimize/hide continues sync; explicit exit releases the area.
- Stop behaviors restore, retain, and turn off correctly.
- Protected or DRM video may capture as black; report the limitation and never
  attempt bypass.
- Internal capture-to-send latency remains below 50 ms at High/Extreme with
  bounded memory and no queued-frame growth.

## Assumptions And Later Releases

- First release supports Windows 10/11. Non-Windows builds remain functional
  but report PC Sync as unavailable.
- Entertainment areas continue to be created and positioned in the official
  Hue app.
- Preferences persist, but an active stream never auto-resumes after
  application restart.
- Deferred options:
  - Individual application-window capture.
  - macOS ScreenCaptureKit/CoreAudio and Linux PipeWire backends.
  - Scenes tab, global keyboard shortcuts, and per-game profiles/automatic game
    launch.
  - Configurable stop-on-hide behavior.
  - Configurable takeover policy: never take over or take over without
    confirmation.
