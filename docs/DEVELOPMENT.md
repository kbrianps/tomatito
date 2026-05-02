# Tomatito Development Guide

This document describes how to build, test, extend and release Tomatito. It is updated as part of every PR that changes scope, alongside README.md and GAPS.md.

## Architecture overview

```
lib/
  main.dart                 boots ProviderScope
  app.dart                  MaterialApp, theme + l10n wiring
  core/                     pure-Dart domain logic, no Flutter widgets
    timer/                  TimerEngine + TimerState + SessionConfig
    theme/                  ColorSchemes, tokens, contrast validator
    motion/                 named animation durations + curves
    statistics/             StreakCalculator
    entitlements/           EntitlementService + Feature enum
    notifications/          NotificationService abstract
    window/                 WindowController abstract
    sound/                  SoundBank (registry of bundled chimes)  [Phase 2]
    crash/                  LocalCrashLogger                         [Phase 2]
  data/                     repositories (settings, statistics)
  presentation/             screens + widgets                        [Phase 1]
  platform/
    desktop/                window_manager / keyboard shortcuts      [Phase 3]
    android/                foreground_service / notification helpers [Phase 3]
  l10n/                     app_*.arb, generated app_localizations.dart
```

The timer engine is pure Dart; nothing in `core/` imports `package:flutter/widgets.dart` (motion / theme tokens import only the drawing primitives `Color`, `Curve`, `Duration`, `Size`). UI subscribes to `Stream<TimerState>` and never touches wall-clock time directly.

## Module responsibilities

| Module | Contract | Implementations |
|--------|----------|-----------------|
| `core/timer` | Owns the state machine: Idle to Focus to ShortBreak to ... to LongBreak | `RealTimerEngine` (Phase 2), `FakeTimerEngine` (Phase 1 + tests) |
| `data/SettingsRepository` | Persist user preferences | `SharedPreferencesSettingsRepository` (Phase 2), `FakeSettingsRepository` (Phase 1) |
| `data/StatisticsRepository` | Local history of completed periods | Drift-backed (Phase 2) |
| `core/notifications/NotificationService` | End-of-period chime + persistent notification | Android impl (Phase 3), desktop no-op (Phase 3) |
| `core/window/WindowController` | Always-on-top, compact mode, state persistence | Desktop (Phase 3), Android no-op |
| `core/entitlements/EntitlementService` | Gate features for future monetization | `AlwaysFreeEntitlementService` (v1) |

All abstract interfaces have a Riverpod provider that throws `UnimplementedError` until overridden in `main()` or in a test. Phase 1 `main()` will register the Fake implementations; Phase 2 swaps in real ones.

## Build

### Toolchain (pinned)

- Flutter: 3.41.6 stable (`flutter --version`)
- Dart: 3.11.4 (bundled with Flutter)
- Android SDK: API 35, NDK r26d
- JDK: 17
- Linux desktop: clang, cmake, ninja-build, pkg-config, libgtk-3-dev
- Windows: Visual Studio 2022 Build Tools + Windows SDK

### Android

```bash
flutter pub get
flutter build apk --debug          # smoke
flutter build appbundle --release  # for Play
```

Signing for release requires the upload key. See "Release process".

### Linux

```bash
sudo apt install clang cmake ninja-build pkg-config libgtk-3-dev
flutter pub get
flutter build linux --release
```

Output at `build/linux/x64/release/bundle/`.

### Windows

```bash
flutter pub get
flutter build windows --release
```

Output at `build\windows\x64\runner\Release\`.

## Tests

### Layout

```
test/
  core/                widget-free pure-Dart unit tests
  data/                repository tests (use temp dirs / in-memory)
  presentation/
    widgets/           in-isolation widget tests
    golden/            full-screen goldens per theme + text scale
integration_test/      end-to-end happy paths per platform
```

### Running

```bash
flutter test                       # all unit + widget
flutter test test/core/            # one folder
flutter test --coverage            # writes coverage/lcov.info
flutter test --update-goldens      # rewrite goldens (review before commit)
flutter test integration_test/     # platform-specific
```

### Coverage targets

- `lib/core/`: at least 90 %
- `lib/data/`: at least 80 %
- `lib/presentation/`: at least 60 % plus golden tests for every screen in every theme

CI gates merges on `flutter analyze --fatal-infos --fatal-warnings` and `flutter test` passing.

## Adding things

### A new theme

1. Add an `AppThemeId` enum value in `lib/core/theme/app_themes.dart`.
2. Add a `static const ColorScheme` and wire it up in `schemeFor`.
3. Verify `flutter test test/core/theme/contrast_validator_test.dart` still passes for the new pair. If a value cannot clear AA, document the trade-off in `docs/GAPS.md`.
4. Add a golden test under `test/presentation/golden/timer_screen_<id>_test.dart`.

### A new locale

1. Drop `lib/l10n/app_<locale>.arb` next to the existing files.
2. `flutter pub get` regenerates `app_localizations.dart`.
3. No code change required.

### A new bundled sound

1. Drop the OGG / AAC file in `assets/sounds/` (under 50 KB, royalty-free, attribution if CC-BY).
2. Register it in `lib/core/sound/sound_bank.dart` with id, label, file path.
3. Verify `flutter test test/core/sound/` if applicable.

## Platform integration

### Android

- minSdkVersion 21, targetSdkVersion follows the current Play requirement (API 35 as of v1).
- POST_NOTIFICATIONS requested only on API 33+, only when the user enables the persistent notification toggle.
- FOREGROUND_SERVICE_TYPE declared conditionally for API 34+.
- All branches use `Build.VERSION.SDK_INT` checks; older APIs gracefully no-op.
- Battery-optimization exemption is never requested automatically. Aggressive OEM behaviour is documented in GAPS.md.

### Desktop

- `window_manager` for always-on-top + compact mode.
- Keyboard shortcuts via `Shortcuts` / `Actions` widgets.
- Linux ships .deb and Flatpak; AppImage optional.
- Windows ships MSIX or folder distribution.

## CI

GitHub Actions in `.github/workflows/ci.yml`:

- analyze (`--fatal-infos --fatal-warnings`)
- format check (`dart format --set-exit-if-changed`)
- unit + widget tests with coverage upload as a build artifact

Platform builds (android, linux, windows) and the Internal Testing track upload arrive in Phase 3 / Phase 4. Tracked in GAPS.md.

## Code style

- `very_good_analysis` is the lint baseline.
- Trailing commas, single quotes.
- Default to no comments; only when *why* is non-obvious.
- Public docstrings for abstract interfaces only; concrete impls speak through tests.

## Decision records

### Why Riverpod (not Provider, not Bloc)?

`flutter_riverpod` gives compile-time safety, easy override-in-test and is preferred by the spec. The codegen variant (`@riverpod`) is intentionally *not* used in Phase 0; we revisit if/when we have many providers.

### Why Drift (not Hive)?

Hive is in maintenance limbo (the original maintainer paused; community fork is `hive_ce`). Drift is actively maintained, type-safe and SQL-based, which gives us proper aggregations for the statistics view.

### Why no Riverpod codegen yet?

We have under ten providers in Phase 0 and the abstract interfaces map cleanly to a single `Provider<T>` each. Codegen would add `build_runner` to the inner dev loop without enough payoff. Reconsider in Phase 2.

### Why MIT (not Apache-2.0)?

MIT is shorter, more permissive and matches the surrounding Flutter ecosystem. There is no patent-grant requirement that justifies the complexity of Apache-2.0 for an app of this size.

### Why slightly darker Tomatito accent than spec

See the GAPS entry "Tomatito accent darker than spec for AA compliance". Short version: `#C0392B` clears WCAG AA 4.5:1 against white onPrimary; the spec value `#E74C3C` is kept as `AppThemes.tomatitoBrand` for icon and splash use where 3:1 is enough.

## Release process

### Versioning

Semver in `pubspec.yaml`:

- `MAJOR.MINOR.PATCH+BUILD`
- `versionName` = `MAJOR.MINOR.PATCH`
- `versionCode` = monotonic from git tag count

### Tagging

```bash
git tag v0.1.0
git push --tags
```

### Signing (Android)

Upload key generated once, stored in a system keystore (NEVER committed). `android/key.properties` is git-ignored. Rotation procedure: generate a new key, request Play Console upload-key reset, swap `key.properties`.

### Store assets

`assets/store/` ships icon, feature graphic (1024 x 500), screenshots per theme, source files where available.

### Permissions justifications (Play Console)

| Permission | Justification |
|------------|---------------|
| POST_NOTIFICATIONS | Required for the optional persistent timer notification and end-of-period chimes. Off by default. |
| FOREGROUND_SERVICE | Required to keep the timer ticking accurately while the screen is off, when the user opts into the persistent notification. |
| FOREGROUND_SERVICE_DATA_SYNC | API 34+ classification for the foreground service above. |
| WAKE_LOCK | Required for accurate timing during a focus period. |
| VIBRATE | Optional alternative to the chime; off by default. |

### Rollback policy

Production releases are gated through Internal then Closed then Production. Any crash-free-rate drop greater than 0.5 percentage points within 24 h triggers a halt to the staged rollout. Rollback is "stop rollout" + new patch release, not "remove from store".

## Roadmap

- v1.0: per spec.
- v1.1: system tray + minimize-to-tray (desktop), data export (CSV / JSON), in-app crash log viewer, hot-reload of locale changes, custom theme color editor (potentially paid).
- v1.2: auto-update mechanism for desktop builds.
- Future paid candidates: cloud sync, custom sound packs, advanced analytics, multi-device aggregation, calendar integration, extra theme packs.

## Accessibility audit notes

(Filled in at v1 release after testing TalkBack, Narrator, Orca on the primary flows.)
