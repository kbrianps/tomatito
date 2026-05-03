# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Phase 0 scaffolding: project structure, very_good_analysis lint baseline, GitHub Actions CI for analyze + test, theme tokens, motion tokens, l10n infrastructure (en and pt_BR), and abstract interfaces for `TimerEngine`, `SettingsRepository`, `StatisticsRepository`, `NotificationService`, `WindowController`, `EntitlementService`.
- Four `ColorScheme` definitions (Light, Dark, Black OLED, Tomatito) with WCAG AA contrast verification (`ContrastValidator`) covering surface, primary, secondary and error pairs.
- `AlwaysFreeEntitlementService` v1 implementation (every feature unlocked).
- `docs/GAPS.md` initialized with the 13 deferred / open items from the spec and Phase 0 audit.
- MIT licence, README, privacy policy, terms of use.
- Phase 1 UI: every screen built and navigable.
- `FakeTimerEngine` (in-memory state machine with auto-period transitions, strict mode, configurable speed multiplier), `FakeSettingsRepository`, `FakeStatisticsRepository` (with seeded sample week), `NoOpNotificationService`, `NoOpWindowController`.
- `ThemeController` (StateNotifier) with reactive theme switching cross-faded by `MaterialApp.themeAnimationDuration`.
- Custom widgets: `TickPainter` (30-tick dial with sweeping active highlight), `TimerDial`, `AnimatedMinuteText` (slide-and-fade digit transitions, MM:SS in the final minute), `ControlButtons`, `DailyProgress`.
- Screens: `TimerScreen` (hero, state-driven dial + controls + status text), `SettingsScreen` (timer / goal / appearance sections, all changes apply immediately), `StatisticsScreen` (today + weekly bar chart), `AboutScreen` (version + "Why these numbers?" expansion + open-source licences).
- Adaptive navigation shell: `NavigationBar` on narrow viewports, `NavigationRail` at >= 720 dp.
- Extended l10n with full UI strings for en and pt.
- Tests: `FakeTimerEngine` unit tests (start, reset, pause+resume, strict mode, skip, long-break end), `TickPainter` widget + paint tests, navigation smoke test.
- Phase 2 real engine + persistence.
- `RealTimerEngine`: Stopwatch-tracked elapsed across pauses (immune to Timer drift), Timer.periodic only as the tick beat for UI emissions.
- `SharedPrefsSettingsRepository`: JSON-encoded SessionConfig + theme id + daily goal in SharedPreferences; falls back to defaults on missing or corrupt data.
- `JsonStatisticsRepository`: line-delimited JSON file in app docs dir; per-line append, corrupt-line tolerant on read. Drift migration deferred to Phase 2.x.
- `StreakCalculator` real implementation: today does not break the streak when not yet hit; DST-safe day arithmetic via the DateTime constructor.
- `StatsRecorder`: bridge that subscribes to the engine and records each completed focus period.
- `main()` becomes async, wires real implementations behind the same Riverpod provider overrides; UI is unchanged.
- Tests: `RealTimerEngine` state machine, `StreakCalculator` (empty, today-hit, today-missed, multi-day chain, gap, DST fall-back, same-day sum), `SharedPrefsSettingsRepository` (round-trip, corrupt fallback, change notifications), `JsonStatisticsRepository` (record / query / range / corrupt-line tolerance). 62 tests total, all passing.
- GAPS extended with deferred items: SessionCheckpoint, SessionPlanner, Drift migration, sound bank, vibration, LocalCrashLogger, StatsRecorder lifecycle.
- Phase 3 platform integration (desktop windowing + Android notifications).
- `DesktopWindowController` (Linux / macOS / Windows) backed by window_manager; `setAlwaysOnTop` wired, compact mode + state persistence stubbed for Phase 3.x.
- `AndroidNotificationService` plays end-of-period chimes via flutter_local_notifications on a high-importance "period_complete" channel; persistent timer notification + foreground service stubbed for Phase 3.x.
- `ChimeRecorder` bridges engine completions into the notification chime (mirrors `StatsRecorder`).
- `main()` picks the right `WindowController` and `NotificationService` per platform; restores always-on-top on launch.
- Keyboard shortcuts wrapper at the app level: Space toggles play/pause, Ctrl+R resets, Ctrl+S skips. Ctrl+, and Esc deferred to 3.x.
- `SettingsScreen` gains a Window section (desktop only) with the Always-on-top toggle, persisted across launches and applied immediately.
- `SettingsRepository` extended with `loadAlwaysOnTop` / `saveAlwaysOnTop`; both repos updated; round-trip test added.
- Android manifest declares POST_NOTIFICATIONS for runtime request on API 33+.
- GAPS extended with Phase 3.x deferrals: compact mode, window state persistence, Android persistent / foreground service notification, Linux desktop notifications, Ctrl+, and Esc shortcuts.
