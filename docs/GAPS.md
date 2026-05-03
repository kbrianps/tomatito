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

- Severity: medium (downgraded from high after Phase 3.x mitigation)
- Area: Android background reliability
- Description: Xiaomi MIUI, Huawei EMUI, OnePlus and similar OEMs apply aggressive task-killing that can stop the foreground service despite our best practices.
- Impact: timer pauses mid-session on affected devices.
- Plan: surface a one-time inline tip the first time a session is interrupted, with a link to system settings. No general fix is possible.
- Mitigation (Phase 3.x): when `restoreFromCheckpointIfFresh` reports `staleDiscarded`, the TimerScreen shows a one-time MaterialBanner with guidance ("Allow Tomatito to ignore battery optimisations"). The tip is gated by `oem_tip_shown` in SharedPreferences so it does not nag. The "Open battery settings" deep link is still pending; for now the tip is text-only. Track the deep link in a separate follow-up.
- Opened: 2026-05-02

## [OPEN] OEM tip "Open battery settings" deep link

- Severity: low
- Area: Android background reliability
- Description: the Phase 3.x OEM battery tip is text-only. A "Open battery settings" button would jump to `Settings > Apps > Tomatito > Battery` for the user.
- Impact: extra friction; users must navigate the system settings themselves.
- Plan: add `android_intent_plus` (or use `url_launcher` with package URI) and wire an action button on the MaterialBanner that fires `IGNORE_BATTERY_OPTIMIZATION_SETTINGS` or `APPLICATION_DETAILS_SETTINGS`. Phase 3.x follow-up.
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

## [CLOSED] StatisticsScreen weekday labels are English-only

- Severity: low
- Area: l10n
- Description: weekday labels (Mon, Tue, ...) on the weekly bar chart were hard-coded English. The intl package was in pubspec but `initializeDateFormatting` was not wired.
- Impact: pt locale showed English weekday names on the stats chart.
- Plan: wire `initializeDateFormatting` in `main()` and use `DateFormat('E', locale)` in Phase 1.x.
- Resolution: Phase 3.x. main calls `await initializeDateFormatting()` (loads all locales). StatisticsScreen uses `DateFormat('E', Localizations.localeOf(context).toString())` for short weekday labels. pt locale renders "seg, ter, qua, qui, sex, sáb, dom".
- Opened: 2026-05-02
- Closed: 2026-05-02

## [OPEN] AboutScreen privacy + terms tiles inert (source / support working)

- Severity: low
- Area: about screen
- Description: Phase 3.x wired `url_launcher` and enabled the source-code (GitHub repo) and support-development (GitHub Sponsors) tiles. Privacy + terms remain disabled until either hosted URLs exist (GitHub Pages) or an in-app markdown viewer renders the local docs.
- Impact: users cannot reach the privacy policy or terms from inside the app yet.
- Plan: pick one of (a) host docs/PRIVACY_POLICY.md + docs/TERMS.md on GitHub Pages and launch URLs, or (b) add `flutter_markdown` and render in-app screens. (a) is simpler; chase before Play Store submission. Phase 4 release prep.
- Opened: 2026-05-02

## [OPEN] Period-transition animations not yet built

- Severity: medium
- Area: motion
- Description: spec calls for a 600 ms colour-tween + tick-sweep when Focus -> Break, plus a final-tick celebration. Phase 1 ships only the per-tick TweenAnimationBuilder; period transitions appear as snaps.
- Impact: misses one of the spec's signature motion moments.
- Plan: drive the `TimerPeriodComplete` state through a longer animation controller and tween the dial colours; Phase 1.x or Phase 2.
- Opened: 2026-05-02

## [CLOSED] "Follow system" theme option

- Severity: low
- Area: theming
- Description: spec mentions a "Follow system" option pairing Light/Dark with `MediaQuery.platformBrightness`. Phase 1 shipped only the four named themes.
- Impact: users who switched system theme did not see Tomatito follow.
- Plan: add `AppThemeId.system` value or a separate themeMode setting; resolve at app build time. Phase 1.x.
- Resolution: Phase 3.x. Added `AppThemeId.system` enum case; `schemeFor` accepts an optional `Brightness` and routes system to `lightScheme` / `darkScheme`. `app.dart` watches `MediaQuery.platformBrightnessOf`. Settings picker shows the option. `AppThemes.validatedSchemes` is the new constant for tests that iterate fixed schemes (system is excluded since it has no fixed scheme of its own).
- Opened: 2026-05-02
- Closed: 2026-05-02

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

## [CLOSED] SessionCheckpoint and resume-after-kill

- Severity: high
- Area: resilience
- Description: spec calls for a 5-second checkpoint to disk and a "Resume your interrupted focus period?" prompt on next launch when the saved state is < 30 minutes old. Phase 2 shipped only the persistent settings + stats; the engine's running state was lost on app kill.
- Impact: users whose app was killed mid-session lost their place in the cycle.
- Plan: implement `SessionCheckpoint` (JSON file in app docs dir) with write-on-tick at 5 s intervals; add a startup prompt in the timer screen when a fresh checkpoint exists. Phase 2.x.
- Resolution: Phase 3.x. `SessionCheckpoint` value object + `CheckpointStore` (per-app-instance JSON file), `RealTimerEngine` writes every 5 s during running periods and once on pause, clears on `start` / `reset`. `restoreFromCheckpointIfFresh(config)` puts the engine into a TimerPaused state on next launch when the checkpoint is < 30 min old; stale checkpoints are silently cleared. The "Resume your interrupted focus period?" dialog is a separate UX deferral and lands in a follow-up; the silent restore is the safer default in the meantime.
- Opened: 2026-05-02
- Closed: 2026-05-02

## [CLOSED] Resume-after-kill confirmation dialog

- Severity: low
- Area: UX
- Description: spec required a "Resume your interrupted focus period?" prompt on launch when a fresh checkpoint exists. Phase 3.x first shipped silent restore-to-paused instead, which was faster for the user but skipped the explicit choice.
- Impact: a user who genuinely wanted to start fresh had to tap Reset once after launch instead of dismissing a dialog.
- Plan: add a one-shot dialog in the TimerScreen post-frame callback when a checkpoint was just restored, with Resume / Start fresh buttons. Phase 3.x follow-up.
- Resolution: Phase 3.x. main constructs a `BootstrapResult({restoredFromCheckpoint, shouldShowOemTip})` and overrides `bootstrapResultProvider`. TimerScreen reads it on the first post-frame callback and shows an AlertDialog with Resume / Start fresh buttons (Resume is a no-op since the engine is already restored to paused; Start fresh calls `engine.reset()`). Mutually exclusive with the OEM tip banner (only one fires per launch).
- Opened: 2026-05-02
- Closed: 2026-05-02

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

## [CLOSED] Sound bank and chime playback

- Severity: medium
- Area: sound
- Description: spec describes a soft bell, wood block and gentle pulse chime, plus an optional tick during focus. Phase 2 shipped neither the bundled audio files nor the just_audio integration.
- Impact: end-of-period notifications were silent until Phase 2.x.
- Plan: source three CC0 chimes (under 50 KB each, OGG / AAC), add `SoundBank` + `SoundPlayer`, expose chime + tick controls in Settings. Phase 2.x.
- Resolution: Phase 3.x. Three chimes generated with ffmpeg + libvorbis (soft_bell 7 KB, wood_block 5 KB, gentle_pulse 6 KB), all under the 50 KB spec cap. `SoundBank` registry + `SoundPlayer` abstract + `JustAudioSoundPlayer` (production, swallows backend errors silently) + `NoOpSoundPlayer` (tests / unsupported platforms). `ChimeRecorder` plays the configured chime at the configured volume on every TimerPeriodComplete. SettingsScreen Sound section: chime picker (RadioGroup over SoundBank.all) + volume slider 0..100%. Persistence: `SettingsRepository.loadChimeId` / `loadChimeVolume`. The optional tick-during-focus stays deferred (see new entry below).
- Opened: 2026-05-02
- Closed: 2026-05-02

## [OPEN] Optional tick sound during focus deferred

- Severity: low
- Area: sound
- Description: spec describes a faint, low-frequency tick during focus periods, off by default. Phase 3.x ships only end-of-period chimes.
- Impact: users wanting a metronome-style focus aid have to bring their own.
- Plan: bundle a short tick OGG (< 5 KB), add a separate `SoundPlayer` invocation on each Timer.periodic boundary while in TimerRunning + focus, gate by Settings toggle. Phase 3.x follow-up.
- Opened: 2026-05-02

## [CLOSED] Sound preview button in Settings

- Severity: low
- Area: sound
- Description: spec called for tapping a chime option to play it once at the configured volume, so users can audition before committing.
- Impact: users had to wait for an actual period to end to hear the chime.
- Plan: add a "Play" trailing icon on each RadioListTile that calls SoundPlayer directly with the option + current volume. Phase 3.x follow-up.
- Resolution: Phase 3.x. `soundPlayerProvider` exposes the `JustAudioSoundPlayer` (with `NoOpSoundPlayer` fallback). SettingsScreen adds an `IconButton(Icons.play_arrow_outlined)` as the `secondary` of each chime RadioListTile that calls `soundPlayer.play(option, volume: currentVolume)`. en + pt strings for the tooltip ("Preview" / "Tocar").
- Opened: 2026-05-02
- Closed: 2026-05-02

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

## [OPEN] Compact-mode UI not built

- Severity: low
- Area: desktop
- Description: spec describes a 220x260 compact window with just dial + play/pause and a corner toggle to switch back. Phase 3 wires the abstract `WindowController.setCompactMode` to a no-op; the route + UI are pending.
- Impact: desktop users cannot collapse the timer to a small overlay.
- Plan: build a `CompactTimerScreen`, wire window resize via window_manager, and surface the corner toggle from the `TimerScreen` header. Phase 3.x.
- Opened: 2026-05-02

## [OPEN] Window state persistence (size + position) deferred

- Severity: low
- Area: desktop
- Description: spec calls for window size + position to persist across launches. Phase 3 only persists the always-on-top flag; the window opens at the OS-default position every time.
- Impact: minor; users on multi-monitor setups must reposition the window after each launch.
- Plan: implement `persistWindowState` / `restoreWindowState` on `DesktopWindowController` (window_manager getBounds + setBounds) and call them on app start / dispose. Phase 3.x.
- Opened: 2026-05-02

## [CLOSED] Android persistent timer notification + foreground service

- Severity: high
- Area: Android background reliability
- Description: spec wires `flutter_foreground_task` to a persistent live-updating notification with play/pause/skip actions, kept alive by a foreground service. Phase 3 shipped only the end-of-period chime; the persistent notification toggle was not yet exposed in Settings.
- Impact: when the screen was off, the timer relied on Dart isolate scheduling, which Android may pause; long focus sessions could drift or stop on aggressive OEMs.
- Plan: integrate `flutter_foreground_task` with a TaskHandler that mirrors the engine state, expose the toggle in Settings (with just-in-time POST_NOTIFICATIONS request on API 33+), and add the FOREGROUND_SERVICE / FOREGROUND_SERVICE_DATA_SYNC manifest entries. Phase 3.x.
- Resolution: Phase 3.x. flutter_foreground_task wired with a minimal TaskHandler entrypoint (`tomatitoForegroundTaskEntrypoint` in `lib/platform/android/foreground_task_handler.dart`, marked `@pragma('vm:entry-point')`). `AndroidNotificationService.updatePersistentTimer` / `clearPersistentTimer` start, update and stop the service via `FlutterForegroundTask`. New `PersistentNotificationRecorder` bridges the engine, throttles updates to minute boundaries (avoids hundreds of cross-isolate calls per session), reacts to the Settings toggle, and requests POST_NOTIFICATIONS just-in-time when the user enables the toggle. Settings → Notifications section (Android only) ships the toggle. Manifest declares FOREGROUND_SERVICE + FOREGROUND_SERVICE_DATA_SYNC + WAKE_LOCK. Open follow-up: notification action buttons (play/pause/skip from the lock screen) deferred, see new entry below.
- Opened: 2026-05-02
- Closed: 2026-05-02

## [OPEN] Persistent notification action buttons deferred

- Severity: low
- Area: Android background reliability
- Description: spec calls for play/pause/skip action buttons on the persistent timer notification. Phase 3.x foreground service ships only the live remaining-time + title; user has to open the app to pause/skip.
- Impact: extra friction; lock-screen control is one of the spec's nice-to-haves.
- Plan: wire `FlutterForegroundTask.notificationButtonHandler` with three buttons and dispatch each to the right engine call via a SendPort from the TaskHandler isolate to the main isolate. Phase 3.x follow-up once the service is observed in production.
- Opened: 2026-05-02

## [OPEN] Linux desktop notifications deferred

- Severity: low
- Area: desktop notifications
- Description: `flutter_local_notifications` supports Linux via libnotify, but Phase 3 wires the notification path only on Android. Desktop runs through `NoOpNotificationService`, so end-of-period chimes are silent on Linux.
- Impact: desktop users hear nothing when a period ends.
- Plan: add a `LinuxNotificationService` (libnotify) and switch `_buildNotificationService()` to pick it on Linux. Phase 3.x or together with the sound-bank integration.
- Opened: 2026-05-02

## [CLOSED] Keyboard shortcuts: Ctrl+, and Esc

- Severity: low
- Area: keyboard
- Description: spec listed Ctrl+, (open Settings) and Esc (close modal / leave compact mode) alongside Space / Ctrl+R / Ctrl+S. Phase 3 wired the latter three only.
- Impact: spec parity gap; desktop power users missed two shortcuts.
- Plan: thread Settings navigation + modal stack through the shortcuts scope and bind both keys. Phase 3.x.
- Resolution: Phase 3.x. RootShell now uses a `navigationIndexProvider` (StateProvider) so any callback can navigate. Ctrl+, sets the index to 2 (Settings). Esc calls `tomatitoNavigatorKey.currentState?.maybePop()` via a global navigator key on MaterialApp; pops modals (license page, About, dialogs) without needing a BuildContext.
- Opened: 2026-05-02
- Closed: 2026-05-02
