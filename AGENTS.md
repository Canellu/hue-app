# AGENTS.md

Guidance for coding agents working in this repository.

Use the official Hue API v2 reference for endpoint details:
https://developers.meethue.com/develop/hue-api-v2/api-reference/

## Stack

- **Frontend**: React 19 + TypeScript 6, Vite 7, Tailwind CSS 4
- **Component library**: shadcn/ui (`base-maia` style, built on `@base-ui/react`, not Radix). Components live in `src/components/ui/` and are added with `bunx shadcn@latest add <name>`.
- **Routing**: TanStack Router with in-memory history for the desktop webview.
- **Icons**: lucide-react
- **Animations/interactions**: browser view transitions, `motion`, and dnd-kit for Home layout editing.
- **Backend**: Tauri 2 (Rust) desktop shell and IPC layer.
- **Package manager**: Bun

The `@/*` path alias maps to `src/` through `tsconfig.json` and `vite.config.ts`.
`src/lib/utils.ts` exports the `cn()` class-merge helper.

## Commands

```bash
# Frontend dev server only
bun dev

# Tauri development app (starts Vite + desktop window)
bun tauri dev

# Frontend production build/typecheck
bun run build

# Tauri production build
bun tauri build

# Preview the built frontend
bun run preview
```

Rust is compiled by `tauri dev` / `tauri build` during normal development, so
do not run separate `cargo` commands unless you specifically need Rust-only
diagnostics.

## Architecture

The app discovers and controls Philips Hue lights through a local Hue Bridge.
All normal bridge communication uses Hue API v2:
`https://{ip}/clip/v2/...`, with the bridge's self-signed certificate accepted.
All persisted and UI-facing Hue resource ids are v2 UUIDs.

The only non-v2 bridge calls are discovery and pairing:

- mDNS `_hue._tcp.local.` discovery
- `https://discovery.meethue.com/` fallback discovery
- CLIP link-button pairing via `POST http://{ip}/api`

```text
React frontend --Tauri IPC--> Rust backend --HTTPS Hue API v2--> Hue Bridge
```

The ready-state UI is a room/zone-first shell: a custom window title bar, a
minimal global app header, and one routed content area. There is no sidebar or
tab bar for app navigation.

Routes are defined in `src/router.tsx`:

- `/` - Home
- `/space/$spaceId` - Room or Zone detail
- `/settings` - Settings

The router uses `createMemoryHistory({ initialEntries: ["/"] })` because the
desktop shell has no useful URL bar. `defaultViewTransition` is enabled and the
routed content area uses the named `page` view-transition element in `App.css`.

## Frontend

- `src/main.tsx` - React entry point; wraps `App` in `HueProvider`.
- `src/App.tsx` - top-level app state. Renders loading, setup wizard,
  disconnected bridge error, or the ready router. Owns light/dark/system theme
  state, applies `.dark` and `color-scheme` to `<html>`, persists `themeMode`,
  and registers `mod+j` as a theme toggle.
- `src/router.tsx` - TanStack Router route tree with memory history.
- `src/context/HueContext.tsx` - bridge session state (`bridgeId`, `bridgeIp`,
  `applicationKey`, `configured`, `connected`). Calls `get-hue-session` on
  mount and exposes `refreshSession`, `applySession`, and `resetSession`.
- `src/context/ThemeContext.tsx` - theme context (`light`, `dark`, `system`,
  resolved mode, setter, toggle).
- `src/context/HueResourcesContext.tsx` - shared Hue data layer. Fetches
  rooms, zones, lights, and scenes; starts the event stream; owns Home grouping
  and layout edit state; exposes optimistic handlers for room/zone, light,
  color, and scene control. Mounted once in `RootLayout` so data survives route
  changes.
- `src/hooks/useGlobalKeyboardShortcut.ts` - reusable global keyboard shortcut
  hook.

### Routes

- `src/routes/RootLayout.tsx` - mounts `HueResourcesProvider`, renders
  `AppHeader`, and renders the active route via `<Outlet />`.
- `src/routes/HomeRoute.tsx` - wires `useHueResources()` to `HomeScreen` and
  navigates to `/space/$spaceId`.
- `src/routes/SpaceRoute.tsx` - finds the selected room/zone, filters lights and
  scenes for it, owns the selected light drawer and active scene id.
- `src/routes/SettingsRoute.tsx` - wires `useTheme()` to `SettingsScreen`.

### Components

- `src/components/TitleBar.tsx` - fixed 40px custom Tauri title bar with drag,
  minimize, and close behavior; gracefully no-ops in browser previews.
- `src/components/AppHeader.tsx` - fixed-height global header. Home shows a
  time-of-day greeting, Home grouping tabs (`Rooms`, `Zones`, `Custom`), layout
  editing controls, and Settings. Space/Settings show an icon-only Back button.
- `src/components/DebouncedSlider.tsx` - reusable shadcn `Slider` wrapper that
  updates local UI immediately and debounces bridge writes.
- `src/components/ui/` - shadcn/base-ui components. Keep additions consistent
  with the local style and import through `@/components/ui/...`.

### Home Screen

`src/features/home-screen/` contains the Home route UI.

- `HomeScreen.tsx` - sectioned room/zone grid with dnd-kit drag and drop for
  custom layout editing. Supports reordering sections, reordering spaces inside
  a section, and moving spaces across sections.
- `components/LayoutSection.tsx` - one named Home section. Empty sections keep a
  tile-sized placeholder to avoid layout shift and can be deleted only when
  empty.
- `components/SpaceTile.tsx` / `SortableSpaceTile.tsx` - room/zone cards and
  sortable wrappers.
- `components/room-zone-icons.tsx` - Hue archetype to lucide icon mapping.
- `hooks/useHomeLayout.ts` - persists app-local Home layout and grouping mode in
  `localStorage`, reconciles stored ids against live Hue room/zone ids, reads
  legacy `roomIds`, and writes current `spaceIds`.

Home has three grouping modes:

- `rooms-first` - derived from Hue resources, Rooms then Zones.
- `zones-first` - derived from Hue resources, Zones then Rooms.
- `custom` - persisted app-local section/order layout.

### Space Screen

`src/features/space-screen/` contains the room/zone detail UI.

- `SpaceScreen.tsx` - room/zone title, grouped power switch, grouped brightness
  via `grouped_light`, scene chips, and individual light grid.
- `components/LightCard.tsx` - per-light tile with power/brightness.
- `components/LightDrawer.tsx` - right-side overlay drawer for individual light
  controls. It does not reserve layout space or reflow the page.
- `components/ColorWheel.tsx` - color picker.
- `utils/color.ts` - OKLCH, CIE xy, mired, and Kelvin conversion helpers.
- `utils/color-state.ts` - live tile, swatch, and scene color derivation.

### Settings And Setup

- `src/features/settings-screen/SettingsScreen.tsx` - theme segmented control
  (`Light`, `Dark`, `System`), bridge status/details, reconnect, and reset
  confirmation.
- `src/features/setup-wizard/WizardContainer.tsx` - setup flow:
  welcome -> discovering -> pairing countdown -> success/error.

## Styling And Theming

`src/App.css` is the single stylesheet. It imports Tailwind and the shadcn layer,
defines OKLCH design tokens for light `:root` and `.dark`, sets view-transition
styles, and provides global app/window styling.

Use Tailwind utilities that reference tokens (`bg-background`,
`text-muted-foreground`, `border-border`, etc.). Do not add separate component
CSS files unless the architecture changes.

Theme preference is persisted as `themeMode` in `localStorage`. Valid values are
`light`, `dark`, and `system`. Dark mode is applied by toggling `.dark` on
`document.documentElement`.

## Rust Backend

Tauri commands live in `src-tauri/src/commands/`:

- `discovery.rs` - `discover-bridges`, `pair-bridge`, `get-hue-session`,
  `reset-hue-session`
- `lights.rs` - `get-hue-lights`, `set-light-state`, `set-light-color`
- `rooms.rs` - `get-hue-rooms`
- `zones.rs` - `get-hue-zones`
- `grouped_lights.rs` - `set-grouped-light-state`
- `scenes.rs` - `get-hue-scenes`, `activate-scene`
- `events.rs` - `start-hue-events`, `stop-hue-events`; guarded by managed
  `EventStreamState` so only one background SSE task runs.

`src-tauri/src/services/hue_client.rs` is the core Hue API v2 client. It handles:

- mDNS discovery with cloud discovery fallback
- CLIP link-button pairing
- session restore and bridge rediscovery
- generic `get_v2` / `put_v2` helpers
- light, room, zone, grouped light, scene, device, zigbee connectivity, and
  bridge resource mapping
- event stream parsing and Tauri event emission

Rooms aggregate lights through member devices' `light` services. Zones reference
light children directly. Light metadata and reachability come from `device` and
`zigbee_connectivity`.

`src-tauri/src/lib.rs` registers Tauri plugins, command handlers, managed
event-stream state, and Windows window styling for the border/shadow.

## Real-Time Sync

`run_event_stream` opens a persistent SSE connection to:

```text
https://{ip}/eventstream/clip/v2
```

It sends `hue-application-key` and `Accept: text/event-stream`, uses a streaming
reqwest client with no request timeout, accepts the bridge self-signed cert, and
reconnects with a 3s backoff.

The backend emits `hue-event` carrying `Vec<HueEventUpdate>`. Updates include:

- `type`
- `id`
- `on`
- `brightness`
- `xy`
- `mirek`

`HueResourcesProvider` matches `grouped_light` updates by
`id === roomZone.groupedLightId` and `light` updates by `id === light.id`.

## Storage

- Bridge info: Tauri store file `hue-store.json`
- Application key/API credential: system keyring service `com.anton.hue-app`,
  account `hue-application-key`
- Theme preference: `localStorage` key `themeMode`
- Home custom layout: `localStorage` key `hue-dashboard-layout`
- Home grouping mode: `localStorage` key `hue-dashboard-grouping-mode`

## Hue Data Rules

- Hue API v2 brightness is 0-100 dimming percentage end-to-end. Do not convert
  to or from the legacy 0-254 scale.
- Color temperature is in mireds in API/backend/frontend state.
- The light drawer may display Kelvin using `1e6 / mirek`.
- All Hue resource ids used by the UI are v2 UUIDs.
- Room/zone power and brightness controls must target their `grouped_light`
  resource id, not the room/zone resource id.
