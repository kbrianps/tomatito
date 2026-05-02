# Gaps & Technical Debt Register

This is a living document. Any PR that takes a shortcut, hardcodes a value, ships a partial fix or skips a test must add an entry here in the same commit. Reviewers reject PRs that hide debt.

Statuses: `OPEN` (work pending), `CLOSED` (resolved, kept for history), `DEFERRED` (acknowledged, no near-term plan).

---

## [DEFERRED] System tray and minimize-to-tray on desktop

- Severity: low
- Area: desktop integration
- Description: `tray_manager` not yet integrated; the timer window can only be minimised, not hidden to a tray icon.
- Impact: desktop power users cannot keep Tomatito running invisibly.
- Plan: target v1.1.
- Opened: 2026-05-02

## [DEFERRED] Data export (CSV / JSON) of statistics

- Severity: low
- Area: statistics
- Description: no built-in export of focus history.
- Impact: users who want to analyse their data externally must read the SQLite file directly.
- Plan: target v1.1.
- Opened: 2026-05-02

## [DEFERRED] In-app crash log viewer

- Severity: low
- Area: crash handling
- Description: crashes are written to a rolling local log file with a "send by email" button in About; no in-app viewer.
- Impact: power users debugging their own crashes must open the log file from disk.
- Plan: target v1.1.
- Opened: 2026-05-02

## [DEFERRED] Auto-update mechanism for desktop builds

- Severity: medium
- Area: desktop release
- Description: no Sparkle / WinSparkle equivalent. Users must download new versions manually.
- Impact: slower adoption of fixes on desktop.
- Plan: target v1.2; investigate platform options.
- Opened: 2026-05-02

## [DEFERRED] Hot-reload of locale changes without app restart

- Severity: low
- Area: l10n
- Description: locale picked up on next launch only.
- Impact: minor; users rarely change system language with the app open.
- Plan: target v1.1.
- Opened: 2026-05-02

## [DEFERRED] iOS, macOS, Web builds

- Severity: low
- Area: platform coverage
- Description: out of scope per v1 spec. Codebase does not preclude them; nothing iOS- or web-specific exists in the platform/ tree.
- Impact: users on those platforms cannot use Tomatito.
- Plan: no current plan.
- Opened: 2026-05-02

## [DEFERRED] Custom theme color editor beyond the four presets

- Severity: low
- Area: theming
- Description: users can pick from Light, Dark, Black OLED, Tomatito but cannot customise colours further.
- Impact: limited personalisation.
- Plan: potential paid feature; deferred indefinitely.
- Opened: 2026-05-02

## [DEFERRED] Cloud sync of statistics

- Severity: low
- Area: statistics
- Description: stats are local-only by design.
- Impact: multi-device users cannot aggregate focus history.
- Plan: potential paid feature; deferred indefinitely.
- Opened: 2026-05-02

## [DEFERRED] DND auto-enable on Linux

- Severity: low
- Area: focus assist
- Description: no standard cross-distro mechanism for Do-Not-Disturb activation.
- Impact: Linux users must enable DND manually before focus.
- Plan: deferred indefinitely.
- Opened: 2026-05-02

## [OPEN] Aggressive OEM battery management may kill the foreground service

- Severity: high
- Area: Android background reliability
- Description: Xiaomi MIUI, Huawei EMUI, OnePlus and similar OEMs apply aggressive task-killing that can stop the foreground service despite our best practices.
- Impact: timer pauses mid-session on affected devices.
- Plan: surface a one-time inline tip the first time a session is interrupted, with a link to system settings. No general fix is possible.
- Opened: 2026-05-02

## [OPEN] CI does not yet build platform binaries

- Severity: medium
- Area: CI
- Description: Phase 0 CI runs analyze + test on Ubuntu only. Android, Linux and Windows builds are not yet wired.
- Impact: pubspec changes that break a platform compile may slip past CI.
- Plan: extend CI in Phase 3 once platform integration code lands.
- Opened: 2026-05-02

## [OPEN] Tomatito accent darker than spec for AA compliance

- Severity: low
- Area: theming
- Description: spec calls out `~#E74C3C` as the signature tomato red. The actual `ColorScheme.primary` for the Tomatito theme is `#C0392B` so `onPrimary` white passes WCAG AA 4.5:1 for text on buttons. The brighter `#E74C3C` is preserved as `AppThemes.tomatitoBrand` for icon, splash and dial active-tick contexts where the bar is 3:1 for graphical objects.
- Impact: brand accent is slightly less vivid in primary-coloured UI surfaces.
- Plan: revisit when the Material 3 colour system supports separate "brand" and "ink" tokens cleanly.
- Opened: 2026-05-02

## [OPEN] Alchemist (golden test framework) deferred to Phase 1

- Severity: low
- Area: testing
- Description: Phase 0 ships only `flutter_test`'s built-in `matchesGoldenFile`. The spec lists Alchemist or `golden_toolkit` for responsive + theme matrix goldens.
- Impact: golden coverage is per-screen-per-theme manual until Phase 1 wires Alchemist.
- Plan: add `alchemist` to dev_dependencies at the start of Phase 1, port any Phase 0 goldens to its API.
- Opened: 2026-05-02
