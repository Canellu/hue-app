# Production security hardening audit

Audit date: 2026-08-14

## Completed controls

- Replaced the null CSP with a packaged-app policy. Scripts, fonts, and normal
  assets are self-only; frames, forms, objects, and media are disabled; frontend
  connections are limited to Tauri IPC. Inline styles remain enabled because the
  current React UI generates style attributes.
- Disabled Tauri's global JavaScript API and removed the broad opener default.
  Only the `main` window can open the four exact Mote Desktop legal/support URLs
  and an email addressed to `support@motedesktop.com`. Widget windows have no
  opener permission.
- Removed the Hue application key from the serialized session returned to the
  frontend. Application keys, entertainment credentials, and Sync Box tokens stay
  in the Rust backend and system keyring.
- Validated Hue resource types and resource IDs before constructing API paths.
  No command accepts a frontend filesystem path or shell command.
- Kept invalid-certificate acceptance inside the local Hue Bridge clients. Sync
  Box authenticated traffic continues to use the bundled Philips CA, hostname
  verification, and a pinned DNS target; its unauthenticated probe carries no
  credentials.
- Production logging no longer prints event transport failures, bridge addresses,
  widget settings paths, or raw crash details. Low-level network, parsing,
  keyring, and settings errors return fixed production messages while retaining
  detailed diagnostics in debug builds.
- Production frontend source maps are not emitted. Unused global Tauri and opener
  capabilities were removed.

## Dependency results

### Rust

`cargo audit` reports no known vulnerabilities after updating `crossbeam-epoch`
to 0.9.20 and `quick-xml` to 0.41.0 through its `plist` dependency.

It still reports 19 allowed warnings. Most are unmaintained GTK3 crates used on
non-Windows targets. The other notable transitive warnings are unmaintained
`bincode` 1.3.3, unmaintained `proc-macro-error` and `unic-*` crates, and yanked
`spin` 0.9.8. These currently have no RustSec vulnerability finding, but should
be reviewed when their parent libraries publish upgrades.

### JavaScript

A production-only npm-compatible audit reports zero vulnerabilities. `bun audit`
still reports 29 advisories in development/build tooling, primarily through
Shadcn CLI, ESLint, Vite/PostCSS, and their transitive dependencies. Those tools
are not shipped as application runtime dependencies. The unused `geist` package
was removed, and build-only Tailwind/Shadcn packages were moved to
`devDependencies`.

### Licenses

The production JavaScript dependency scan reports permissive MIT, Apache-2.0,
BSD-3-Clause, ISC, 0BSD, Unlicense, and OFL-1.1 licenses. Cargo metadata likewise
reports permissive licenses or permissive alternatives for dependencies. The app
package itself remains `UNLICENSED` until its distribution/license terms are
chosen. A distributable third-party notices file is still required before Store
submission.

## Verification

- `bun run build`: passed
- `bun run lint`: passed with one existing Fast Refresh warning
- `cargo test`: 80 passed
- `cargo check --release`: passed
- `bun tauri build --no-bundle`: passed and produced the release executable
- `cargo audit`: no vulnerabilities; 19 allowed transitive warnings
- production JavaScript dependency audit: no vulnerabilities
