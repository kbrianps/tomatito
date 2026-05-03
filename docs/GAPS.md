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

## [OPEN] Phase 1 ships without per-screen goldens

- Severity: medium
- Area: testing
- Description: Phase 1 lands every screen but no `matchesGoldenFile` snapshots are committed yet. Smoke tests confirm widgets build; visual regression coverage is manual.
- Impact: a careless theme tweak could change visuals without test failure.
- Plan: add a golden per screen per theme (4 themes x 4 screens = 16) at the start of Phase 1.x, ideally on top of Alchemist.
- Opened: 2026-05-02

## [OPEN] StatisticsScreen weekday labels are English-only

- Severity: low
- Area: l10n
- Description: weekday labels (Mon, Tue, ...) on the weekly bar chart are hard-coded English. The intl package is in pubspec but `initializeDateFormatting` is not wired.
- Impact: pt locale shows English weekday names on the stats chart.
- Plan: wire `initializeDateFormatting` in `main()` and use `DateFormat('E', locale)` in Phase 1.x.
- Opened: 2026-05-02

## [OPEN] AboutScreen external links are inert

- Severity: medium
- Area: about screen
- Description: privacy / terms / source / support tiles render as disabled. `url_launcher` not yet added; in-app docs viewer also not built.
- Impact: users cannot reach the privacy policy or source code from inside the app.
- Plan: add `url_launcher` and either deep-link to hosted policy URLs or render the markdown locally. Phase 1.x.
- Opened: 2026-05-02

## [OPEN] Period-transition animations not yet built

- Severity: medium
- Area: motion
- Description: spec calls for a 600 ms colour-tween + tick-sweep when Focus -> Break, plus a final-tick celebration. Phase 1 ships only the per-tick TweenAnimationBuilder; period transitions appear as snaps.
- Impact: misses one of the spec's signature motion moments.
- Plan: drive the `TimerPeriodComplete` state through a longer animation controller and tween the dial colours; Phase 1.x or Phase 2.
- Opened: 2026-05-02

## [OPEN] "Follow system" theme option deferred

- Severity: low
- Area: theming
- Description: spec mentions a "Follow system" option pairing Light/Dark with `MediaQuery.platformBrightness`. Phase 1 ships only the four named themes.
- Impact: users who switch system theme do not see Tomatito follow.
- Plan: add `AppThemeId.system` value or a separate themeMode setting; resolve at app build time. Phase 1.x.
- Opened: 2026-05-02

## [OPEN] Compact-mode UI not built

- Severity: low
- Area: desktop
- Description: spec describes a compact window with just dial + play/pause. Phase 1 wires the abstract `WindowController` but the compact UI route is unimplemented.
- Impact: desktop power users cannot collapse the timer to a small overlay.
- Plan: build a `CompactTimerScreen` and the route swap in Phase 3 alongside platform window integration.
- Opened: 2026-05-02

## [OPEN] Onboarding tour deferred

- Severity: low
- Area: first-run
- Description: spec describes a 3-screen optional welcome tour. Phase 1 ships sensible defaults so the user can press play immediately, but the tour is not implemented.
- Impact: less hand-holding for first-time users.
- Plan: build the 3-screen flow + "Show welcome tour again" entry in About in Phase 1.x.
- Opened: 2026-05-02

## [OPEN] SessionCheckpoint and resume-after-kill deferred

- Severity: high
- Area: resilience
- Description: spec calls for a 5-second checkpoint to disk and a "Resume your interrupted focus period?" prompt on next launch when the saved state is < 30 minutes old. Phase 2 ships only the persistent settings + stats; the engine's running state is lost on app kill.
- Impact: users whose app is killed mid-session lose their place in the cycle.
- Plan: implement `SessionCheckpoint` (JSON file in app docs dir) with write-on-tick at 5 s intervals; add a startup prompt in the timer screen when a fresh checkpoint exists. Phase 2.x.
- Opened: 2026-05-02

## [DEFERRED] SessionPlanner auto-divide mode

- Severity: low
- Area: timer
- Description: spec lets users pick a total session length (e.g., 90 min) and auto-calculates focus / break / cycle counts. Phase 2 ships only manual mode (set durations directly).
- Impact: users wanting a "give me a 90-minute session" shortcut have to compute it themselves.
- Plan: add a `SessionPlanner` pure-Dart class with thorough unit tests; wire a "session length" picker into the TimerScreen header. Phase 2.x.
- Opened: 2026-05-02

## [DEFERRED] Drift migration for statistics

- Severity: low
- Area: persistence
- Description: spec lists Drift or Hive for stats. Phase 2 ships line-delimited JSON instead, since the query patterns (per-day sum, per-week range) are trivial scans on small data.
- Impact: when stats grow past a year of records, scans become slower; queries that need joins or window functions are awkward.
- Plan: migrate to Drift when query patterns warrant it (window aggregates, multi-month rollups, custom reports). Reader supports the existing JSON file as a one-shot migration source.
- Opened: 2026-05-02

## [OPEN] Sound bank and chime playback not wired

- Severity: medium
- Area: sound
- Description: spec describes a soft bell, wood block and gentle pulse chime, plus an optional tick during focus. Phase 2 ships neither the bundled audio files nor the just_audio integration.
- Impact: end-of-period notifications are silent until Phase 2.x.
- Plan: source three CC0 chimes (under 50 KB each, OGG / AAC), add `SoundBank` + `SoundPlayer`, expose chime + tick controls in Settings. Phase 2.x.
- Opened: 2026-05-02

## [OPEN] Vibration on Android not wired

- Severity: low
- Area: sound / haptics
- Description: spec lists vibration as an alternative to chime, off by default. Not yet implemented.
- Impact: silent users have no haptic alternative.
- Plan: add a Settings toggle and call `HapticFeedback.heavyImpact` (or a vibration plugin for longer patterns) on period completion. Phase 2.x.
- Opened: 2026-05-02

## [OPEN] LocalCrashLogger not built

- Severity: low
- Area: crash handling
- Description: spec specifies a rolling local crash log (max 1 MB) caught from `FlutterError.onError` and `PlatformDispatcher.onError`, with an opt-in "Send crash log" link in About. Phase 2 ships nothing here; uncaught exceptions go to stderr only.
- Impact: in-the-wild crashes leave no breadcrumb for the user to send.
- Plan: implement `LocalCrashLogger` with file rotation, wire global error handlers in `main()`, enable the existing About list tile. Phase 2.x.
- Opened: 2026-05-02

## [OPEN] StatsRecorder lifecycle is implicit

- Severity: low
- Area: architecture
- Description: `main()` constructs `StatsRecorder`, calls `start()`, then holds a reference via `_keepAlive(...)` so the GC does not collect it. Works but is a smell.
- Impact: when notifications and the foreground service land in Phase 3, the recorder will need a real owner that can hand off the engine and stats refs across process boundaries.
- Plan: introduce an explicit lifecycle coordinator in Phase 3 alongside the foreground service. Until then, the recorder lives for the duration of the app process.
- Opened: 2026-05-02
