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

The ready-state UI is a **room/zone-first shell** (no sidebar, no tab bar): a
minimal global header over a single content area. Home is populated from Hue API
v2 `room` and `zone` resources (`GET https://{bridgeIp}/clip/v2/resource/room`
and `GET https://{bridgeIp}/clip/v2/resource/zone`). Room/zone ordering and Home
layout sections are app-local state; they do not come from Hue. Navigation uses
**TanStack Router** with an **in-memory history** (no URL bar in the desktop
webview): `/` (Home), `/space/$spaceId` (Room or Zone), and `/settings`
(Settings). Route changes animate via the
router's `defaultViewTransition` (direction-aware `slide-left`/`slide-right` types
keyed off the history index); the routed content area is the named `page`
view-transition element and the slide keyframes live in `App.css`. A light's
controls open in an overlay drawer that slides in from the right; it does not
reserve layout space or reflow the page.

**Frontend (`src/`)**

- `main.tsx` — wraps the app in `HueProvider`
- `context/HueContext.tsx` — global session state (bridgeId, bridgeIp, applicationKey, connected/configured). Calls `invoke("get-hue-session")` on mount; exposes `refreshSession`, `applySession`, `resetSession`.
- `context/ThemeContext.tsx` — light/dark theme value (`themeMode`, `toggleTheme`); state lives in `App.tsx`, consumed by the Settings route.
- `context/HueResourcesContext.tsx` — shared Hue data layer: fetches rooms/zones/lights/scenes, owns the event stream, Home layout edit state, and optimistic update handlers; exposed via `useHueResources()`. Mounted once in the router root so data persists across navigation.
- `App.tsx` — renders `WizardContainer` (not configured), an error state (configured but disconnected), or the router via `RouterProvider` (ready); owns theme state and provides `ThemeContext`.
- `router.tsx` — TanStack Router route tree (memory history): root = `RootLayout`, children = Home / Space / Settings routes in `src/routes/`.
- `routes/` — route wiring only:
  - `RootLayout.tsx` — router root layout: mounts `HueResourcesProvider`, renders `AppHeader` + the active route via `<Outlet/>`
  - `HomeRoute.tsx` — wires `useHueResources()` to `HomeScreen` and navigates to `/space/$spaceId`
  - `SpaceRoute.tsx` — owns `selectedLightId`/drawer + active scene, scoped to a Hue room or zone
  - `SettingsRoute.tsx` — wires `useTheme()` to `SettingsScreen`
- `features/home-screen/` — Home route screen and Home-only components:
  - `HomeScreen.tsx` — grouped responsive grid of Hue room/zone cards; drag-and-drop layout editing (dnd-kit) reorders rooms/zones and moves them between local layout sections. Empty sections keep a one-tile placeholder to avoid layout shift, and cross-container dragging uses pointer-first collision detection with hysteresis.
  - `components/LayoutSection.tsx`, `SpaceTile.tsx`, `SortableSpaceTile.tsx`, `room-zone-icons.tsx`
  - `hooks/useHomeLayout.ts` — persists local Home sections/order to `localStorage` and reconciles them against live room/zone ids. It reads the legacy `roomIds` key and writes the current `spaceIds` key.
- `features/space-screen/` — Room/Zone detail route:
  - `SpaceScreen.tsx` — room/zone power `Switch` + brightness through the Hue `grouped_light`, scene chips (`Button`, active-state), per-light card grid
  - `components/LightCard.tsx`, `LightDrawer.tsx`, `ColorWheel.tsx`
  - `utils/color.ts`, `color-state.ts` — OKLCH/CIE xy/mired conversion and live tile/swatch/scene color derivation
- `features/settings-screen/SettingsScreen.tsx` — bridge info/status (`Card`), reconnect, theme toggle, and reset (`AlertDialog` confirm)
- `features/setup-wizard/WizardContainer.tsx` — multi-step setup flow (welcome → discovering → pairing with countdown → success/error)
- `components/AppHeader.tsx` — minimal global header with a **fixed height** (no layout shift when its contents swap). Left side shows the time-of-day greeting on Home, or an icon-only back `Button` on Space/Settings. Right side shows the Settings gear plus (Home only) the Edit-Layout controls, separated by vertical `Separator` dividers; in edit mode it shows Create New Section | Cancel · Save. Create-section + back actions are driven from `useHueResources()`.
- `components/DebouncedSlider.tsx` — reusable wrapper around the shadcn `Slider`; updates instantly but throttle/debounces writes to the bridge (`onValueChange` live, `onValueCommitted` on release)
- `types/hue.ts` — shared Hue API v2-facing payload types (`HueRoom`, `HueZone`, `HueRoomZone`, `HueLight`, `HueScene`, `HueEventUpdate`; all brightness is 0–100, all ids are v2 UUIDs)
- `types/app-layout.ts` — app-local Home layout section/order types

**Styling & theming**

`src/App.css` is the single stylesheet: it imports Tailwind + the shadcn layer and defines the design tokens as **OKLCH** CSS variables (`--background`, `--primary`, `--card`, …) for both light (`:root`) and dark (`.dark`) themes. Components are styled with Tailwind utility classes referencing those tokens (`bg-background`, `text-muted-foreground`, etc.) — there is no separate component CSS. Dark mode is toggled by adding/removing `.dark` on `<html>`; `App.tsx` owns the theme state and persists it to `localStorage`.

**Rust backend (`src-tauri/src/`)**

- `commands/discovery.rs` — `discover-bridges`, `pair-bridge`, `get-hue-session`, `reset-hue-session`
- `commands/lights.rs` — `get-hue-lights`, `set-light-state` (on/brightness), `set-light-color` (xy / mirek / effect)
- `commands/rooms.rs` — `get-hue-rooms` (`GET /clip/v2/resource/room`)
- `commands/zones.rs` — `get-hue-zones` (`GET /clip/v2/resource/zone`)
- `commands/grouped_lights.rs` — `set-grouped-light-state` (controls a Hue `grouped_light` resource by id)
- `commands/scenes.rs` — `get-hue-scenes`, `activate-scene` (v2 scene recall)
- `commands/events.rs` — `start-hue-events` / `stop-hue-events`. Spawns one background task (guarded by managed `EventStreamState`) that streams bridge changes; `reset-hue-session` stops it.
- `services/hue_client.rs` — core v2 client: mDNS discovery, pairing, session restore (bridge id via `/clip/v2/resource/bridge`), and generic `get_v2`/`put_v2` helpers over the v2 resources (`light`, `room`, `zone`, `grouped_light`, `device`, `zigbee_connectivity`, `bridge_home`, `scene`). Rooms aggregate their lights via member devices' `light` services; zones reference lights directly. Light metadata (model/firmware/MAC) and reachability come from `device` + `zigbee_connectivity`.

**Real-time sync (v2 EventStream)**

`run_event_stream` opens a persistent SSE connection to `https://{ip}/eventstream/clip/v2` (header `hue-application-key`, `Accept: text/event-stream`) using `new_streaming` (no request timeout, accepts self-signed cert). It parses SSE blocks and emits a `hue-event` Tauri event carrying `Vec<HueEventUpdate>` (`{ type, id, on, brightness }`; `id` is the v2 UUID, brightness is dimming %, 0–100), reconnecting with a 3s backoff. `HueResourcesProvider` matches `grouped_light` changes by `id === group.groupedLightId` and `light` changes by `id === light.id` to live-update the UI.

**Storage**

- Bridge info → Tauri store (`hue-store.json`)
- Application key (API credential) → system keyring (`com.anton.hue-app`)
- Theme preference → `localStorage`

**Brightness scale**: v2 uses a 0–100 dimming percentage end-to-end, so the UI sends/receives percentages directly (no 0–254 conversion). Color temperature is in mireds; the light drawer displays Kelvin (`1e6 / mirek`).
