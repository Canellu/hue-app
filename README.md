# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## UI components

UI primitives live in [`src/components/ui`](src/components/ui) and come from
[shadcn/ui](https://ui.shadcn.com), configured for Base UI via the `base-maia`
style in [`components.json`](components.json).

If a component you need doesn't exist yet, add it with the shadcn CLI instead of
hand-writing it, so it matches the project's style and aliases:

```sh
npx shadcn@latest add <component>   # e.g. dropdown-menu button-group
```

The component is generated into `src/components/ui`. Tweak it there as needed.
