# Selection state audit — unifying "selected" / hover / default across the app

**Status:** Implemented. Persistent selections now use a subtle neutral fill
with a 2px low-opacity border. Edit/canvas selections use a 2px overlay ring.
Checkboxes share the Base UI primitive in `src/components/ui/checkbox.tsx`.

Goal: one cohesive, consistent look for selected / hover / default states across
**all** screens and surfaces. Today every surface re-invents "selected" inline,
so they drift on border color, background alpha, ring presence, ring width, and
checkbox rendering.

---

## 0. The edit-mode selection ring (`[data-edit-selected]`) — DONE

Location: `src/App.css` (bottom of file).

### Original (the bug you spotted)

```css
[data-edit-selected] {
  box-shadow:
    0 0 0 2px var(--background),
    /* inner band: 2px of --background (a gap) */ 0 0 0 4px var(--primary); /* outer band: 2px of --primary showing outside */
}
```

This is **two stacked box-shadows = two concentric bands**, not one ring:

- Inner 2px band = `--background` (a gap so the ring floats off the card)
- Outer 2px band = `--primary` (the actual ring)

Both tokens invert per theme, so the _character_ of the ring flips (not just its
color):

| Theme | Inner band (`--background`)            | Outer band (`--primary`)           | Reads as                              |
| ----- | -------------------------------------- | ---------------------------------- | ------------------------------------- |
| Dark  | `0.22` — lighter than lit card edge    | `0.922` — near-white, also lighter | soft double-halo (both bands lighter) |
| Light | `0.98` — near-white, lighter than card | `0.205` — near-black, darker       | white gap + hard dark outline         |

So the outer band goes from _lighter-than-card_ (dark) to _darker-than-card_
(light) → dark mode = glow, light mode = hard outline. Different _kind_ of
signal per theme = the core inconsistency.

### Current state

```css
[data-edit-selected] {
  border-color: transparent;
  box-shadow: 0 0 0 2px var(--selection-ring);
}
```

- One 2px overlay ring using the dedicated `--selection-ring` token.
- The normal tile border becomes transparent while selected, preventing it from
  blending with live-color and gradient surfaces.

Drives: space-screen manage mode — SceneCard + LightCard via `data-edit-id`
(the "ANTON PC" edit-function screen).

---

## 1. Original catalogue — pre-migration

At least **7 different visual languages** for "selected", plus **3 separate
checkbox implementations**.

### A. Box-shadow "edit ring"

`[data-edit-selected]` in `src/App.css` (see §0). Space-screen manage mode.

### B. `border-primary + bg-primary/5` tinted card (most common; ~6 variants)

| Surface                                                                                                  | Selected                                          | Default / Hover                              |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| `ToggleTargetRow` — `src/features/widget-screen/components/ManageControls.tsx:409` (widget toggles list) | `border-primary/50 bg-primary/5`                  | `border-border/60 bg-card hover:bg-muted/40` |
| `TypeOption` — `src/features/settings-screen/components/RoomZoneWizard.tsx:354`                          | `border-primary bg-primary/5`                     | `border-foreground/15 hover:bg-foreground/5` |
| Config type card — `src/features/settings-screen/components/EntertainmentAreaWizard.tsx:408`             | `border-primary bg-primary/5`                     | `border-foreground/15 hover:bg-foreground/5` |
| Placement chip — `src/features/settings-screen/components/EntertainmentAreaWizard.tsx:556`               | `border-primary bg-primary/5`                     | `border-foreground/12` (no hover)            |
| `SyncControls` — `src/components/sync/SyncControls.tsx:164`                                              | `border-primary bg-primary/8 ring-1 ring-primary` | `border-border bg-muted/50 hover:bg-accent`  |
| Archetype icon — `src/features/settings-screen/components/RoomZoneWizard.tsx:253`                        | `border-primary bg-primary/10`                    | `border-foreground/15 hover:bg-foreground/5` |

Alpha drifts across these: `/5`, `/8`, `/10`; `border-primary` vs
`border-primary/50`; some add `ring-1 ring-primary`, some don't.

### C. `ring-1 ring-primary` accent tiles

- Accessory / effect tiles — `src/features/space-screen/SpaceScreen.tsx:909`
- LightPane effects — `src/features/space-screen/components/LightPane.tsx:751`

`border-primary bg-accent text-foreground ring-1 ring-primary`; default
`border-border hover:bg-accent`.

### D. Corner-check scene card (no ring at all)

`SelectableSceneCard` — `src/features/widget-screen/components/SceneCardRail.tsx:162`.
Selected = `bg-foreground/10` + a `bg-primary` circle w/ checkmark pinned in the
corner. Completely different signal from A–C.

### E. Settings sidebar active row (solid fill, no border/ring)

`SettingsSidebar` — `src/features/settings-screen/components/SettingsSidebar.tsx:41`.
`bg-[oklch(0.95_0_0)] dark:bg-[oklch(0.33_0_0)]`, hover `bg-[oklch(0.97_0_0)]`.
Hardcoded oklch, not tokens.

### F. Sliding pill (segmented)

- `SegmentedControl` — `src/features/settings-screen/components/SegmentedControl.tsx:53`:
  `bg-background border-foreground/12 dark:bg-foreground/12`.
- `ActionSegmented` — `src/features/widget-screen/components/ManageControls.tsx:468`
  (On/off vs Scene) is a _different_ segmented style:
  `bg-background text-foreground shadow-sm`.

### G. Big `ring-4` selection (setup / canvas)

- `SelectBridgeStep` — `src/features/setup-wizard/steps/SelectBridgeStep.tsx:81` /
  `SyncBoxOnboardingWizard` — `src/features/sync-box/SyncBoxOnboardingWizard.tsx:119`:
  `ring-4 ring-foreground/10`.
- RoomCanvas3D pin — `src/features/entertainment-placement/RoomCanvas3D.tsx:671`:
  `border-primary ring-4 ring-primary/15`.
- `GroupLightRail` — `src/features/space-screen/components/GroupLightRail.tsx:95`:
  `border-2` colored by the light's own live color.
- `SyncHubScreen` — `src/features/host-sync/SyncHubScreen.tsx:135`:
  `bg-primary/12 text-primary ring-primary/20`.

### The 3 checkbox implementations (all meant to be "the same checkbox")

1. **Custom `size-5 rounded-md border` + Check icon** (the good one):
   - `ToggleTargetRow` — `src/features/widget-screen/components/ManageControls.tsx:419`
   - `MemberRow` — `src/features/settings-screen/components/RoomZoneWizard.tsx:407`
   - `LightGroupCard` — `src/features/settings-screen/components/EntertainmentAreaWizard.tsx:698`
   - Selected: `border-primary bg-primary text-primary-foreground`; unselected
     `border-foreground/30`. Supports `Minus` for partial (indeterminate).
2. **Native `<input type=checkbox> accent-primary`**:
   - `ResourceChecklist` — `src/features/settings-screen/components/ResourceChecklist.tsx:62`.
     This is the "Edit lights" list in zone settings — an actual OS checkbox,
     visually unlike #1.
3. **Corner circle-check** — idiom D above.

### Hover states are equally fragmented

Across the app: `hover:bg-muted/40`, `hover:bg-muted/60`, `hover:bg-foreground/3`,
`hover:bg-foreground/5`, `hover:bg-accent`, `hover:bg-primary/15`, and hardcoded
`hover:bg-[oklch(0.95_0_0)] dark:hover:bg-[oklch(0.30_0_0)]`. No single "row
hover" token.

---

## 2. Root cause

Rich token system exists in `src/App.css` (surfaces, borders, `--ring`, status
families) but there are **no selection tokens and no shared selected/checkbox
primitives**. Every surface re-invents "selected" inline → drift. No `Checkbox`
component, no `data-selected` / `aria-selected` styling convention.

---

## 3. Implemented selection system

1. Selection tokens live in `App.css`: `--selection-surface`,
   `--selection-border`, `--selection-ring`, and `--interactive-hover`.
2. Persistent cards and rows use `selectableVariants()` from
   `src/lib/selection-styles.ts`.
3. Selected cards use fill + a 2px border without a decorative checkmark.
4. Actual checkbox controls retain checkmarks and use the shared Base UI
   `Checkbox` primitive.
5. Edit/canvas/live-color selections use the shared 2px overlay ring.
6. Keyboard focus, current navigation, segmented controls, and live Hue status
   remain semantically distinct.

---

## 4. Review approach — temporary "selection gallery" page

**Completed and removed:** the temporary selection gallery was used to approve
the treatment, then deleted after the production rollout.
