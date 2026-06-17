# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Use this for all references to HUE endpoints: https://developers.meethue.com/develop/hue-api-v2/api-reference/

## Stack

- **Frontend**: React 19 + TypeScript 6, Vite, Tailwind CSS 4
- **Component library**: shadcn/ui (`base-maia` style, built on `@base-ui/react` — **not** Radix). Components live in `src/components/ui/`, added via `bunx shadcn@latest add <name>`. The `@/*` path alias maps to `src/` (tsconfig `paths` + Vite `resolve.alias`); `lib/utils.ts` exports the `cn()` class-merge helper.
- **Icons**: lucide-react
- **Backend**: Tauri 2 (Rust) — desktop shell and IPC layer
- **Package manager**: Bun

## Commands

```bash
# Development (starts Vite dev server + Tauri window)
bun tauri dev

# Production build
bun tauri build

# Frontend only (no Tauri window)
bun dev
```

Rust code is compiled by `tauri dev/build` automatically — no separate `cargo` invocation needed during normal development.

## Architecture

The app discovers and controls Philips Hue lights via a local Hue Bridge. **All
bridge communication uses the Hue API v2** (`https://{ip}/clip/v2/...`, HTTPS with
the bridge's self-signed cert accepted). All resource ids are v2 UUIDs; the only
non-v2 calls are mDNS/`discovery.meethue.com` discovery and the CLIP link-button
pairing (`POST http://{ip}/api`).

```
React Frontend  ──IPC──►  Tauri/Rust Backend  ──HTTPS (v2)──►  Hue Bridge
```

The ready-state UI is a **room-first shell** (no sidebar, no tab bar): a minimal
global header over a single content area that navigates Home → Room → Light. A
light's controls open in an overlay drawer that slides in from the right; it does
not reserve layout space or reflow the page.

**Frontend (`src/`)**

- `main.tsx` — wraps the app in `HueProvider`
- `context/HueContext.tsx` — global session state (bridgeId, bridgeIp, applicationKey, connected/configured). Calls `invoke("get-hue-session")` on mount; exposes `refreshSession`, `applySession`, `resetSession`.
- `App.tsx` — renders `WizardContainer` (not configured), an error state (configured but disconnected), or `DesktopShell` (ready); owns theme state.
- `features/wizard/WizardContainer.tsx` — multi-step setup flow (welcome → discovering → pairing with countdown → success/error)
- `features/settings/SettingsScreen.tsx` — bridge info/status (`Card`), reconnect, theme toggle, and reset (`AlertDialog` confirm). Rendered inside a right-side `Sheet` opened from the header gear (the Sheet lives in `DesktopShell`).
- `features/desktop/` — the room-first shell:
  - `DesktopShell.tsx` — orchestrator: fetches groups/lights/scenes, owns the event stream + navigation state (`openRoomId` for Home vs Room, `selectedLightId` for the drawer), exposes optimistic update handlers, and hosts the Settings `Sheet`
  - `AppHeader.tsx` — minimal global header: wordmark, live/offline connection `Badge`, Settings gear (`Button`)
  - `HomeScreen.tsx` — time-of-day greeting + grouped, responsive grid of room/zone `Card`s; **drag-and-drop layout editing** (dnd-kit) reorders rooms and moves them between custom groups
  - `RoomScreen.tsx` — back button, room power `Switch` + brightness, scene chips (`Button`, active-state), per-light card grid
  - `LightCard.tsx` — compact light `Card` (name, `Switch`, brightness % + slider, color swatch); clicking opens the drawer
  - `LightDrawer.tsx` — right-side `Sheet`: power `Switch`, brightness, `Tabs` for Color / White / Effects, device-information `Accordion`
  - `ColorWheel.tsx` — **OKLCH** hue/chroma wheel (canvas) → CIE xy, matching the OKLCH theme; `color.ts` holds OKLCH↔sRGB / xy↔RGB / RGB↔HSV / mired→Kelvin conversions
  - `DebouncedSlider.tsx` — wraps the shadcn `Slider`; updates instantly but throttle/debounces writes to the bridge (`onValueChange` live, `onValueCommitted` on release)
  - `useDashboardLayout.ts` — persists the custom dashboard grouping/order to `localStorage` and reconciles it against the live room/zone list; `GroupSection.tsx` / `RoomTile.tsx` / `SortableRoomTile.tsx` render and reorder it
  - `roomIcons.tsx` — maps a v2 room/zone `archetype` → lucide icon
  - `colorState.ts` — derives live tile/swatch/scene colors from current light state
  - `types.ts` — shared payload types (all brightness is 0–100, all ids are v2 UUIDs)

**Styling & theming**

`src/App.css` is the single stylesheet: it imports Tailwind + the shadcn layer and defines the design tokens as **OKLCH** CSS variables (`--background`, `--primary`, `--card`, …) for both light (`:root`) and dark (`.dark`) themes. Components are styled with Tailwind utility classes referencing those tokens (`bg-background`, `text-muted-foreground`, etc.) — there is no separate component CSS. Dark mode is toggled by adding/removing `.dark` on `<html>`; `App.tsx` owns the theme state and persists it to `localStorage`.

**Rust backend (`src-tauri/src/`)**

- `commands/discovery.rs` — `discover-bridges`, `pair-bridge`, `get-hue-session`, `reset-hue-session`
- `commands/lights.rs` — `get-hue-lights`, `set-light-state` (on/brightness), `set-light-color` (xy / mirek / effect)
- `commands/rooms.rs` — `get-hue-groups` (rooms + zones + whole-house id), `set-room-state` (controls a `grouped_light` by id)
- `commands/scenes.rs` — `get-hue-scenes`, `activate-scene` (v2 scene recall)
- `commands/events.rs` — `start-hue-events` / `stop-hue-events`. Spawns one background task (guarded by managed `EventStreamState`) that streams bridge changes; `reset-hue-session` stops it.
- `services/hue_client.rs` — core v2 client: mDNS discovery, pairing, session restore (bridge id via `/clip/v2/resource/bridge`), and generic `get_v2`/`put_v2` helpers over the v2 resources (`light`, `room`, `zone`, `grouped_light`, `device`, `zigbee_connectivity`, `bridge_home`, `scene`). Rooms aggregate their lights via member devices' `light` services; zones reference lights directly. Light metadata (model/firmware/MAC) and reachability come from `device` + `zigbee_connectivity`.

**Real-time sync (v2 EventStream)**

`run_event_stream` opens a persistent SSE connection to `https://{ip}/eventstream/clip/v2` (header `hue-application-key`, `Accept: text/event-stream`) using `new_streaming` (no request timeout, accepts self-signed cert). It parses SSE blocks and emits a `hue-event` Tauri event carrying `Vec<HueEventUpdate>` (`{ type, id, on, brightness }`; `id` is the v2 UUID, brightness is dimming %, 0–100), reconnecting with a 3s backoff. `DesktopShell` matches `grouped_light` changes by `id === group.groupedLightId` and `light` changes by `id === light.id` to live-update the UI.

**Storage**

- Bridge info → Tauri store (`hue-store.json`)
- Application key (API credential) → system keyring (`com.anton.hue-app`)
- Theme preference → `localStorage`

**Brightness scale**: v2 uses a 0–100 dimming percentage end-to-end, so the UI sends/receives percentages directly (no 0–254 conversion). Color temperature is in mireds; the light drawer displays Kelvin (`1e6 / mirek`).
