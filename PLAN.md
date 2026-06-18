# Fullscreen Hue Setup Wizard Redesign

## Summary
Redesign the setup wizard from a small card into a fullscreen onboarding flow with clearer steps: welcome, discovery, bridge selection, pairing, connecting/success, and actionable errors. Keep real Hue behavior unchanged: discovery uses `discover-bridges`, pairing uses `pair-bridge`, and successful pairing still calls `applySession(session)`.

## Key Changes
- Replace the current single-card wizard presentation with a fullscreen layout using centered content, generous spacing, app theme tokens, and a simple code-native Hue Bridge illustration for the pairing step.
- Refactor wizard state to include:
  - `welcome`
  - `discovering`
  - `selectBridge` with discovered `{ bridgeId, bridgeIp }[]`
  - `pairing` with selected bridge and countdown
  - `success`
  - `error` with a typed reason and user-facing message
- Discovery behavior:
  - `Connect` moves to `discovering` and calls `discover-bridges`.
  - If zero bridges are found, show a no-bridges error with troubleshooting copy.
  - If one or more bridges are found, show the bridge selection screen.
  - The user explicitly selects a bridge before pairing.
- Bridge selection UI:
  - Show bridge ID and IP address for each bridge.
  - Use cards/buttons for bridge choices, with one primary `Continue` action.
  - No backend changes are required because `DiscoveredBridge` already exposes `bridgeId` and `bridgeIp`.
- Pairing behavior:
  - Copy should say: “Press the round button on top of your Hue Bridge.”
  - Keep the 60 second countdown and existing polling behavior.
  - Add clearer secondary copy explaining the app is waiting for bridge authorization.
- Error UX:
  - No bridges: mention same network/Wi-Fi and Ethernet/power checks.
  - Pairing timeout: tell the user to press the bridge button and try again.
  - Other pairing/discovery errors: show the backend message plus a generic retry action.
  - Errors should offer `Try again`; pairing errors should return to bridge selection when a bridge is already known.
- Dev mode:
  - Keep `VITE_HUE_WIZARD_DEV`, `?wizardDev`, `#wizard-dev`, and `?wizardDev=0`.
  - Update the dev select to include every new wizard state.
  - Dev-mode actions must not call Tauri IPC unless explicitly triggered by the normal flow; state jumps should be visual-only.

## Interfaces And Structure
- Keep frontend-facing bridge shape as:
  ```ts
  type DiscoveredBridge = {
    bridgeId: string;
    bridgeIp: string;
  };
  ```
- Introduce local wizard types in `WizardContainer.tsx` or a colocated helper file:
  ```ts
  type SetupState =
    | { type: "welcome" }
    | { type: "discovering" }
    | { type: "selectBridge"; bridges: DiscoveredBridge[]; selectedBridgeIp: string }
    | { type: "pairing"; bridge: DiscoveredBridge; countdown: number }
    | { type: "success" }
    | { type: "error"; reason: "no-bridges" | "timeout" | "discovery" | "pairing"; message: string; bridge?: DiscoveredBridge };
  ```
- Prefer extracting step render components only if the main file becomes hard to scan; otherwise keep the first implementation colocated.
- Use existing UI primitives: `Button`, `Card` only for repeated bridge choices, and the new `Select` only for the dev toolbar.
- Keep the custom title bar and app-level dev-mode gate in `App.tsx`.

## Test Plan
- Run `bun run build`.
- Manually verify in dev mode:
  - Welcome renders fullscreen.
  - Discovering renders loading state.
  - Bridge selection renders one and multiple bridge examples.
  - Pairing renders the illustration, countdown, and correct copy.
  - Success renders final confirmation.
  - Each error state renders distinct actionable copy.
- Manual real-flow checks when a bridge is available:
  - Discovery finds bridge(s).
  - Selecting a bridge starts pairing against the selected `bridgeIp`.
  - Link-button polling still succeeds and applies the Hue session.
  - Timeout stops polling and shows the timeout error.
- Responsive checks:
  - Desktop fullscreen layout does not feel like a floating card.
  - Small window/mobile-width preview does not clip the dev toolbar or primary actions.

## Assumptions
- The backend discovery payload remains limited to `bridgeId` and `bridgeIp`; no bridge name or model metadata will be added for this pass.
- The bridge illustration should be built with HTML/CSS or lightweight SVG inside React, not generated bitmap imagery.
- Multiple bridges should always show the selection step, even when only one bridge is found, to make setup explicit and debuggable.
- Production builds must never activate wizard dev mode because the gate remains guarded by `import.meta.env.DEV`.
