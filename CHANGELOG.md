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
