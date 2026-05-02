# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Phase 0 scaffolding: project structure, very_good_analysis lint baseline, GitHub Actions CI for analyze + test, theme tokens, motion tokens, l10n infrastructure (en and pt_BR), and abstract interfaces for `TimerEngine`, `SettingsRepository`, `StatisticsRepository`, `NotificationService`, `WindowController`, `EntitlementService`.
- Four `ColorScheme` definitions (Light, Dark, Black OLED, Tomatito) with WCAG AA contrast verification (`ContrastValidator`) covering surface, primary, secondary and error pairs.
- `AlwaysFreeEntitlementService` v1 implementation (every feature unlocked).
- `docs/GAPS.md` initialized with the 13 deferred / open items from the spec and Phase 0 audit.
- MIT licence, README, privacy policy, terms of use.
