# Plan: Microsoft Store Release

Status: **proposed / not started**. Last reviewed: **2026-08-11**.

## Goal

Publish a stable Windows release of the app through Microsoft Store using the
shortest supportable path for the current Tauri 2 application.

The first Store release does not depend on cloud control, accounts, shared
homes, monetization, calendar integration, Pomodoro, presence automation, or
the broader automation runtime. Those plans can ship in later updates.

## Recommended launch shape

- Windows 10 and Windows 11, x64 first.
- Free first release. Add paid entitlements only after the commerce decision in
  [monetization-and-stack-plan.md](./monetization-and-stack-plan.md).
- Existing Win32 installer submission through Partner Center.
- Tauri NSIS offline installer (`.exe`) as the initial package, using `/S` for
  silent installation. MSI is an acceptable alternative using `/qn`.
- Signed, immutable installer hosted at a versioned HTTPS URL.
- A tested in-app update path because Microsoft Store does not automatically
  update existing users of MSI/EXE listings.
- English Store listing first; add languages only when the app and support
  material are ready in those languages.

Tauri currently generates MSI and NSIS installers rather than a Store MSIX
package. Converting to MSIX is possible with separate Microsoft tooling, but it
is not required for the first release and adds another packaging surface to
test.

## Current repository state

Ready or substantially ready:

- Local Hue control is implemented.
- HDMI Sync Box support is marked complete.
- PC-hosted entertainment sync is complete for the Windows launch scope.
- Windows icons and Tauri bundling are present.
- Application version is currently `0.1.0` across the main manifests.

Release blockers:

- `productName`, window title, package name, identifier, and publisher still use
  tentative branding.
- `bundle.publisher` currently matches the tentative product name; Tauri's
  Store guidance says publisher and product name cannot match.
- No Partner Center product/name reservation is documented.
- No Store-specific offline WebView2 configuration exists.
- No production code-signing configuration or protected signing pipeline exists.
- No immutable installer hosting or update manifest/channel exists.
- The Tauri content security policy is `null`.
- Privacy Policy, Terms/license terms, Support page, feedback, analytics, and
  crash reporting are planned but not implemented.
- Store listing copy, screenshots, logos, declarations, and certification notes
  have not been prepared.
- A repeatable clean-machine release acceptance run has not been documented.

## Phase 0: Product and publisher decisions

- [ ] Choose the final product name. Do not treat “Hue Desktop” as final.
- [ ] Check name availability, relevant trademarks, domain availability, and
  whether the name could imply official Philips Hue affiliation.
- [ ] Choose the publisher display name and legal publisher identity. It must be
  distinct from the product name.
- [ ] Choose the permanent reverse-domain application identifier. Avoid changing
  it after release because it affects installation identity and stored data.
- [ ] Choose a support email and public support URL.
- [ ] Decide whether the Partner Center account is individual or company-owned.
- [ ] Enroll in Partner Center, create an EXE/MSI product, and reserve the final
  Store name.
- [ ] Record Partner Center ownership and recovery details outside the repository
  in an access-controlled business account.

Do not finalize installer identity, signing subjects, screenshots, or public
legal documents until these decisions are complete.

## Phase 1: Freeze the first-release scope

Include:

- Bridge discovery, pairing, restore, reset, and bridge switching.
- Lights, rooms, zones, grouped lights, scenes, and live Hue events.
- Completed HDMI Sync Box functionality.
- Completed Windows PC Sync functionality and its documented limitations.
- Theme, window, tray, autostart, and local settings behavior already considered
  stable.
- Privacy, Support, Terms, version, and diagnostic entry points in Settings.

Exclude from the release branch unless already complete and accepted:

- Cloud control and Hue OAuth.
- App accounts, homes, membership, and guest relay.
- Paid tiers and checkout.
- Calendar, Pomodoro, presence rules, and the shared automation runtime.
- Cross-platform claims beyond the tested Windows release.

- [ ] Create a written v1 feature inventory from the current routes and Settings
  tabs.
- [ ] Hide or remove incomplete controls, placeholder screens, development
  actions, and claims about unavailable features.
- [ ] Document known limitations for support and certification reviewers.
- [ ] Set a release-candidate cutoff after which only release-blocking fixes are
  accepted.

## Phase 2: Finalize application identity and metadata

Update all identity values together:

- [ ] `package.json`: package name and release version.
- [ ] `src-tauri/Cargo.toml`: package version.
- [ ] `src-tauri/tauri.conf.json`: `productName`, version, permanent identifier,
  publisher, and window title.
- [ ] User-facing copy, About screen, diagnostics, legal links, installer name,
  and Store listing.
- [ ] Keyring service/account naming and migration, if the final identifier
  changes existing credential locations.
- [ ] Tauri store/localStorage migration where a rename changes paths or keys.
- [ ] Copyright and publisher metadata.

Keep versions synchronized. Define a simple release rule such as semantic
versioning and never reuse an already-published installer URL or version.

## Phase 3: Privacy, legal, feedback, and support minimum

Use [feedback-analytics-and-legal-plan.md](./feedback-analytics-and-legal-plan.md)
as the detailed design.

Required before submission:

- [ ] Publish a Privacy Policy at a stable HTTPS URL.
- [ ] Publish Terms of Use or choose and declare the applicable standard license
  terms.
- [ ] Publish a Support page with contact instructions and known requirements.
- [ ] Add Privacy, Terms, Support, and version links inside Settings/About.
- [ ] State clearly that the app is unofficial and requires compatible Philips
  Hue hardware on the same network for local features.
- [ ] Document local storage of bridge metadata and OS-keychain storage of Hue
  credentials.
- [ ] Document network destinations and whether any information leaves the local
  network.
- [ ] Provide deletion/contact instructions for any optional feedback email.
- [ ] Obtain a privacy/legal review appropriate to launch markets.

Analytics, crashes, and feedback:

- [ ] Decide whether the first release ships the complete privacy-safe telemetry
  design or ships without telemetry. Do not ship a partial/unreviewed payload.
- [ ] If telemetry ships, implement the closed event schema, redaction, default
  preference/disclosure, permanent opt-out, retention, and vendor configuration.
- [ ] Keep automatic telemetry free of names, email, Hue IDs/names, IPs, paths,
  credentials, screenshots, audio, captured frames, and persistent installation
  identifiers.
- [ ] Keep feedback email optional, empty by default, report-scoped, and separate
  from analytics identity.
- [ ] Verify the published Privacy Policy exactly matches the release binary.

## Phase 4: Production security hardening

- [ ] Replace `app.security.csp: null` with the narrowest working production CSP.
  Allow only packaged assets and explicitly required HTTPS endpoints.
- [ ] Audit every Tauri capability, plugin permission, command, event, URL opener,
  and file/network boundary for least privilege.
- [ ] Confirm arbitrary frontend input cannot produce arbitrary Hue endpoints,
  filesystem paths, shell execution, or opened URLs.
- [ ] Confirm Hue application keys, entertainment credentials, Sync Box tokens,
  bridge addresses, and personal paths never appear in production logs,
  analytics, crash metadata, clipboard data, or UI error reports.
- [ ] Keep bridge self-signed-certificate exceptions scoped only to local Hue
  Bridge transport. Keep the Sync Box pinned-CA path intact.
- [ ] Validate update artifacts and manifests cryptographically before applying
  updates.
- [ ] Remove development endpoints, debug menus, verbose tracing, source maps not
  intended for distribution, test credentials, and unused capabilities.
- [ ] Review bundled third-party licenses and create the required notices.
- [ ] Run dependency vulnerability and license checks for Bun and Cargo locks.

Security hardening should be reviewed separately from frontend release polish.

## Phase 5: Store installer and signing

### Store-specific Tauri configuration

Add `src-tauri/tauri.microsoftstore.conf.json` so Store packaging does not alter
the normal development configuration:

```json
{
  "bundle": {
    "targets": ["nsis"],
    "windows": {
      "webviewInstallMode": {
        "type": "offlineInstaller"
      }
    }
  }
}
```

The exact schema must be checked against the installed Tauri CLI before merging.

- [ ] Choose NSIS EXE or MSI and use only that target for the first submission.
- [ ] Configure the offline WebView2 installer required by Tauri's Store guide.
- [ ] Ensure the installer installs only this app and does not download payloads.
- [ ] Verify silent install: `/S` for Tauri NSIS or `/qn` for MSI.
- [ ] Verify silent upgrade and uninstall behavior, exit codes, and no forced
  restart.
- [ ] Decide per-user versus per-machine installation. Prefer per-user unless a
  tested feature requires elevation.
- [ ] Ensure uninstall removes binaries and autostart entries without deleting
  user data unexpectedly; document retained data.

### Code signing

- [ ] Select a code-signing method whose certificate chain is accepted by the
  Microsoft Trusted Root Program.
- [ ] Keep signing credentials in a protected CI signing service or hardware/
  managed key; never commit certificates, private keys, passwords, or tokens.
- [ ] Configure Tauri signing so the application executable, bundled PE files,
  and installer are signed.
- [ ] Timestamp signatures using a trusted timestamp service.
- [ ] Verify signatures and certificate subject on the final downloaded artifact.
- [ ] Document certificate renewal and emergency key-revocation procedures.

### Repeatable build

Recommended commands after the Store configuration exists:

```powershell
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
bun tauri build --no-bundle
bun tauri bundle --config src-tauri/tauri.microsoftstore.conf.json
```

- [ ] Build from a clean, pinned Windows environment or CI runner.
- [ ] Record toolchain versions and artifact SHA-256 hashes.
- [ ] Produce release notes and a dependency/license bill for the release.
- [ ] Retain the exact signed artifact submitted to Microsoft.

## Phase 6: Hosting and updates

For an MSI/EXE Store listing, Microsoft requires a direct, versioned HTTPS URL
to an immutable offline installer. The binary at a submitted URL must never be
replaced.

- [ ] Choose reliable HTTPS artifact hosting/CDN.
- [ ] Use immutable paths such as
  `https://<download-host>/<product>/<version>/<signed-installer>.exe`.
- [ ] Set the correct binary content type and verify unauthenticated direct
  download from multiple regions.
- [ ] Never overwrite a published object; publish a new versioned URL.
- [ ] Configure monitoring so an expired certificate, missing file, or CDN error
  is detected quickly.
- [ ] Define retention so every active/certified installer remains available.

Updates:

- [ ] Add and configure the Tauri updater or another signed update mechanism.
- [ ] Separate stable and pre-release channels.
- [ ] Ensure Store builds check only the intended production channel.
- [ ] Test upgrade from the oldest supported version while preserving bridge,
  Sync Box, PC Sync, theme, layout, and autostart state.
- [ ] Test failed download, invalid signature, interrupted update, rollback or
  recovery, and an unavailable update service.
- [ ] Document the Partner Center update procedure: new version, new immutable
  installer URL, certification, and release notes.

## Phase 7: Release-candidate validation

### Automated gates

- [ ] Frozen dependency install succeeds.
- [ ] Formatting check, lint, TypeScript typecheck, frontend build, and Rust/Tauri
  production build pass.
- [ ] Rust unit/integration tests relevant to Hue, Sync Box, and PC Sync pass.
- [ ] No uncommitted generated files or secrets are included in the artifact.
- [ ] Installer and executable signatures verify after upload and download.
- [ ] Privacy/telemetry schema tests and redaction tests pass if telemetry ships.

### Clean-machine matrix

Test on clean, supported Windows installations rather than only the development
machine:

- [ ] Windows 10 x64 and Windows 11 x64 with current security updates.
- [ ] Standard non-administrator user.
- [ ] Fresh install, silent install, normal launch, upgrade, repair where
  applicable, and uninstall.
- [ ] First launch without a Hue Bridge, offline launch, firewall denial, and
  recovery when connectivity returns.
- [ ] Bridge discovery, manual/fallback discovery, link-button pairing, credential
  restore, bridge switching, reset, and unreachable bridge behavior.
- [ ] Light/room/zone/scene control and event-stream reconnect behavior.
- [ ] Sync Box discovery, pairing, token restore, pinned TLS, unsupported firmware,
  and disconnect/reconnect behavior on approved hardware.
- [ ] PC Sync Video, Games, Music, selected displays, HDR/SDR, audio devices,
  minimize/tray, stop modes, display/audio removal, takeover, crash, and state
  restoration on approved hardware.
- [ ] Autostart enable/disable and cleanup on uninstall.
- [ ] High-DPI scaling, minimum window size, keyboard-only navigation, screen
  reader labels for primary actions, light/dark/system themes, and reduced motion.
- [ ] No secrets or personal/Hue household values in logs, diagnostics, crashes,
  or feedback preview.

### Beta before public release

- [ ] Use a private/audience-limited Store listing or controlled installer cohort
  for the release candidate.
- [ ] Collect explicit tester confirmation for install/update/uninstall, bridge
  pairing, Sync Box, PC Sync, and recovery cases.
- [ ] Fix only release blockers after the release-candidate cutoff and repeat the
  affected matrix.

## Phase 8: Partner Center submission

- [ ] Complete markets, discoverability, pricing (`Free` initially), and release
  timing.
- [ ] Complete category, age rating, product declarations, device-family/
  architecture, and privacy questions accurately.
- [ ] Declare any third-party commerce only if it exists in the submitted binary.
- [ ] Enter the stable Privacy Policy, Support, and website URLs.
- [ ] Add the versioned installer URL, x64 architecture, EXE/MSI type, English
  language, and silent-install parameter.
- [ ] Provide the final reserved product name and publisher information.
- [ ] Supply description, short description, feature list, applicable license
  terms, system requirements, copyright/trademark information, and support
  contact.
- [ ] Upload final Store logos and at least four representative screenshots.
- [ ] State hardware/network requirements clearly: compatible Hue Bridge and
  lights; Sync Box and entertainment area where applicable; local network;
  Windows-only PC Sync requirements.
- [ ] Give certification reviewers concise setup instructions. If hardware-only
  functionality cannot be exercised normally, explain it without supplying real
  user credentials or weakening production security.
- [ ] Review the current Microsoft Store Policies immediately before submission.
- [ ] Submit for certification and record every certification warning/failure in
  the release issue.

Minimum listing requirements currently include a description, at least one
screenshot, square Store art, applicable license terms, package information, and
the required availability/properties declarations. Prefer a more complete
listing than the minimum.

## Phase 9: Launch and operations

- [ ] Choose manual release after certification rather than an unobserved launch
  if Partner Center offers the option.
- [ ] Confirm installer URL, Privacy, Terms, Support, and update endpoints before
  making the listing public.
- [ ] Install from the public Store listing on a clean device.
- [ ] Monitor crashes, feedback, support mail, installer/CDN health, Store reviews,
  and update adoption without collecting prohibited or undisclosed data.
- [ ] Publish a known-issues page and response process.
- [ ] Define severity levels and an emergency release procedure.
- [ ] For every update: increment versions, rebuild from clean sources, sign,
  test upgrade, publish a new immutable URL, submit it to Partner Center, and
  retain the previous certified artifact.
- [ ] Schedule periodic reviews of Store policy, certificates, dependencies,
  privacy disclosures, retention, and vendor settings.

## Release gate

The first Store submission is ready only when all of these are true:

- [ ] Final name, publisher, identifier, and Partner Center reservation exist.
- [ ] v1 scope is frozen and contains no unfinished surfaces.
- [ ] Privacy, Terms/license, Support, and required in-app links are live.
- [ ] Production CSP and permission/security review are complete.
- [ ] Signed offline installer builds reproducibly and installs silently.
- [ ] Versioned immutable HTTPS hosting and signed updates are tested.
- [ ] Clean Windows 10/11 and Hue hardware acceptance passes.
- [ ] Listing assets, declarations, requirements, and reviewer notes are complete.
- [ ] A rollback/emergency-update and support process exists.

## Immediate next actions

1. Finalize the product name and publisher identity.
2. Enroll in Partner Center and reserve the name as an EXE/MSI product.
3. Freeze the free v1 feature list.
4. Implement the legal/support minimum and decide whether telemetry ships in v1.
5. Add the Store-specific offline installer configuration and signing pipeline.
6. Add and test the update path before distributing a public release candidate.

## Official references

- [Tauri Microsoft Store guide](https://v2.tauri.app/distribute/microsoft-store/)
- [Tauri Windows installer guide](https://v2.tauri.app/distribute/windows-installer/)
- [Microsoft: distribute a Win32 app through Store](https://learn.microsoft.com/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store)
- [Microsoft: MSI/EXE package requirements](https://learn.microsoft.com/windows/apps/publish/publish-your-app/msi/app-package-requirements)
- [Microsoft: MSI/EXE submission checklist](https://learn.microsoft.com/windows/apps/publish/publish-your-app/msi/create-app-submission)
- [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies)

External requirements change. Re-check these primary sources when implementing
packaging and immediately before every submission.
