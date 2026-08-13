# Windows Store packaging and commerce spike

Status: **next implementation task; not started**.

Last reviewed: **2026-08-14**.

## Goal

Determine whether Mote Desktop should replace its current EXE/MSI + NSIS Store
direction with MSIX so the Windows release can use a Microsoft Store durable
add-on for the one-time Mote Pro purchase.

This is a disposable technical spike, not production entitlement or paywall
implementation. Do not gate user features until the spike passes and its package
decision is recorded.

## Questions the spike must answer

1. Can the existing **Mote Desktop** Partner Center product accept an MSIX
   package/submission, or is a different product or product-type migration
   required?
2. Can the Tauri application be packaged with the Partner Center identity and
   installed, launched, updated, and removed correctly as MSIX?
3. Can Rust call `Windows.Services.Store` to discover, purchase, restore, and
   read the cached license for a durable **Mote Pro** add-on?
4. Does the packaged full-trust application retain required Windows behavior,
   especially PC Sync screen/audio capture, widgets, tray, start-on-login,
   keyring access, local Hue networking, and Sync Box networking?
5. Is MSIX plus Store-managed commerce/updates a smaller supported release
   surface than NSIS plus separate licensing, hosting, signing, and updates?

## Guardrails

- Do not delete, rename, or publish the existing Partner Center product while
  investigating its package options.
- Use hidden/private test availability and test product IDs. Do not make a paid
  add-on publicly purchasable.
- Do not add production feature gates, prices, account linking, or Household
  behavior in this spike.
- Keep Store-specific identifiers inside a Windows adapter or spike module.
- Do not commit certificates, Partner Center credentials, Store identity keys,
  transaction data, or other secrets.
- Preserve the normal development and current NSIS configurations until the
  final package decision is made.

## Prerequisites

- Access to the existing Mote Desktop product in Partner Center.
- A Windows 11 development/test machine and a separate Windows user profile or
  clean VM for install testing.
- Current Windows SDK/MSIX packaging and signing tools.
- A Partner Center test flight/private audience suitable for Store-license
  testing.
- A hidden durable add-on with a temporary internal product ID. Its customer
  name may be **Mote Pro Test**; the permanent public product ID is chosen only
  after the spike.

## Work checklist

### 1. Record the current Partner Center identity

- [ ] Record the product type and whether Partner Center permits adding or
      converting to an MSIX submission under the existing reserved product.
- [ ] Record the Store-provided package identity name, publisher, publisher ID,
      package family name, product/Store ID, and supported architectures in a
      private release record. Do not invent these values from
      `com.motedesktop.mote`.
- [ ] Record any Partner Center support answer needed to change product type.
- [ ] Stop and document the blocker if migration would lose the reserved name,
      reviews, ownership, or another material product property.

### 2. Produce a minimal MSIX package

- [ ] Build the normal Tauri release executable from clean sources.
- [ ] Create a separate MSIX packaging configuration using the exact Partner
      Center identity and a full-trust desktop entry point.
- [ ] Include required icons and metadata without changing normal development
      packaging.
- [ ] Install, launch, update, and uninstall the package on the test profile.
- [ ] Verify app data, Windows Credential Manager entries, shortcuts, protocol
      registration where applicable, and uninstall behavior.
- [ ] Record the commands, tool versions, package version, signer, artifact hash,
      and any manual steps needed to reproduce the package.

### 3. Prove Microsoft Store commerce

- [ ] Add a Windows-only Rust spike adapter for `Windows.Services.Store`.
- [ ] Associate Store UI calls with the main Tauri window handle.
- [ ] Query the hidden durable add-on and return only sanitized product state,
      localized title, and localized price to the frontend or a diagnostic view.
- [ ] Invoke Microsoft's purchase UI from an explicit test action.
- [ ] Read `GetAppLicenseAsync` and map the add-on into a provider-neutral
      `pro: active | inactive | unknown` result.
- [ ] Confirm relaunch and restore behavior while signed into the purchasing
      Microsoft account.
- [ ] Confirm the cached active license behavior while offline.
- [ ] Confirm that no purchase flag stored in frontend state or localStorage can
      grant Pro.
- [ ] Record which refund/revocation states can be exercised in the test
      environment and defer the rest explicitly to certification testing.

### 4. Run the native capability smoke test

- [ ] Local Hue discovery, pairing, HTTPS control, and event stream.
- [ ] PC Sync display capture in SDR and HDR where test hardware permits.
- [ ] PC Sync system-audio loopback.
- [ ] Widget creation, independent windows, placement, always-on-top, and
      persistence.
- [ ] Tray, close behavior, single-instance behavior, and start-on-login.
- [ ] Windows Credential Manager and application settings persistence across an
      update.
- [ ] Sync Box discovery, pairing, and control where hardware is available.
- [ ] Standard non-administrator install, launch, update, and uninstall.

## Evidence to retain

- Sanitized screenshots or text exports of Partner Center package/add-on setup.
- Reproducible packaging commands and configuration files.
- MSIX identity and version output.
- Sanitized Store product and entitlement responses containing no user or
  transaction identity.
- Offline/relaunch/restore results.
- Capability smoke-test results and every failure with reproduction steps.
- Artifact SHA-256 hashes. Do not retain or commit test customer data.

## Pass criteria

Choose **MSIX + Microsoft Store commerce** when all of the following are true:

- The existing product can use the required package route without unacceptable
  product migration loss.
- The package builds reproducibly and passes install/update/uninstall checks.
- The Store durable add-on can be discovered, purchased, restored, and read from
  an offline cache through the Rust boundary.
- The packaged app retains the native capabilities required by the v1 inventory.
- Store-managed updates and commerce materially remove more release complexity
  than MSIX packaging adds.

## Failure and fallback

If any pass criterion fails, record the exact reason and choose one of these
explicit outcomes:

1. Ship the first release Free through the existing NSIS EXE/MSI path and defer
   Pro while the packaging issue is resolved.
2. Keep EXE/MSI and adopt a separately reviewed cross-platform commerce and
   signed-license service.
3. Create a new packaged Store product only if the product/name/migration impact
   is understood and accepted.

Do not silently combine Store and custom license checks as an unplanned fallback.

## Decision record to complete

At the end of the spike, append:

```text
Date:
Decision: MSIX | EXE/MSI Free-first | EXE/MSI external commerce | blocked
Existing Partner Center product reusable: yes | no | unknown
Store durable add-on proven: yes | no
Offline cached entitlement proven: yes | no
Native capability smoke test: pass | fail
Primary blockers:
Required follow-up:
Evidence location:
```

After recording the decision, update the Microsoft Store release plan, the
monetization plan, and the package configuration before starting production
entitlement work.
