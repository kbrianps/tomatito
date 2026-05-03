# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Sound preview button works on Linux. `just_audio` ships no native Linux implementation, so calls silently no-op (the soft-bell preview button did nothing). New `AudioplayersSoundPlayer` wraps `audioplayers` (GStreamer-backed on Linux); `_buildSoundPlayer()` picks it on Linux and keeps `JustAudioSoundPlayer` for every other platform. Same `SoundPlayer` interface, no other code paths change.
- Settings and Statistics screens now show a screen title at the top (`Configurações` / `Estatísticas`) so they match the About screen instead of starting straight into content.
- Title bar bottom border removed; the 1 px hairline between the caption row and the body looked like a tab divider on dark themes.
- Skip is allowed from idle. The control button now loads the user's `SessionConfig`, starts the engine and immediately calls `skip()`, leaving the engine paused at the next period (short break) so the user can press play when they are ready.
- Resume-after-kill dialog removed. The engine restores to the previous paused period silently on launch; the user always wanted "resume", and the dialog was friction.
- Title bar gets a Settings (`Icons.tune`) caption button to the left of the pin. In compact mode it expands the window first, then jumps to the Settings tab.
- Compact mode title bar trims to: drag area (no "Tomatito" text) + Settings + Pin + Compact-toggle + Close. The Minimize button is hidden because the small focused window is already a micro-dock.
- Linux runner enables an RGBA visual + transparent FlView background and drops the GtkHeaderBar so the Dart-side `ClipRRect` actually shows rounded corners against the desktop instead of a black halo. `_DesktopFrame` restores the rounded corners on Linux.
- Window size is now constrained: `setMinimumSize(280 x 340)` matches compact mode and `setMaximumSize(900 x 1300)` keeps the layout from spreading too thin. Beyond these the dial cramped into the controls or the dial font would race the 80 px cap.
- Centred session-progress dots row appears below the control buttons. One dot per cycle; completed focus periods are filled with `scheme.primary`, the current focus is filled and slightly larger, future periods are outlined. Reads from `TimerState.cycle` / `totalCycles` (or `idleConfig.cyclesBeforeLongBreak` when the engine is idle).
- Dial centre digits scale with the dial: `AnimatedMinuteText` accepts an optional `fontSize`; `TimerDial` passes `(size * 0.22).clamp(36, ThemeTokens.typeMinutesSmall)` so shrinking the window also shrinks the clock face. Capped at the original Phase 1 token so a giant window does not produce a giant clock face.

- Bottom NavigationBar no longer paints a divider line above itself. Material 3 draws a tonal-elevation surface tint by default that read as a thin white (or theme-tinted) border between the body and the tab row. Set `elevation: 0`, `surfaceTintColor: Colors.transparent`, `shadowColor: Colors.transparent` and pin `backgroundColor` to `scheme.surface`. Removed the `VerticalDivider` between the rail and the body in the wide layout for the same reason.

- Idle Timer screen no longer feels empty. The dial centre shows the configured focus duration (loaded once on first frame from `SettingsRepository.loadSessionConfig`) instead of leaving the centre blank, and the header reads `Período de foco (1 de N)` from the start so the user knows which cycle is queued before pressing play.
- Compact mode keeps the header visible (smaller `bodySmall` weight, centred, single line, ellipsised) so the user always sees `Período de foco (cycle of total)` even in the 280 dp window.

- Linux: drop the rounded `ClipRRect` around the desktop frame. Most GTK compositors paint solid black behind a transparent window region, which produced an ugly halo around the rounded corners. The window is now a sharp rectangle on Linux; macOS / Windows keep the soft 12 dp corners (DWM and Quartz honour the transparent background).
- Compact mode: when active, `RootShell` now hides the bottom NavigationBar / NavigationRail and forces the Timer view (the 280-wide window had no room for either). `TimerScreen` shrinks: smaller outer + card padding, dial fills 95% of the card width, header (`Período de foco (cycle of total)`) and status caption are hidden so only the dial + control buttons remain.
- Compact toggle: expanding no longer brings a maximised window back to fullscreen. The pre-compact size is now clamped to a phone-portrait box (max 560 x 900); if the window was maximised when entering compact, the title bar calls `unmaximize()` before resizing both ways so compositors that retain the maximise state cannot reapply it.

### Added

- Phase 3.x dial colour cross-fade on period transitions.
- Each `PeriodKind` now has a distinct dial accent: focus = `scheme.primary`, shortBreak = `scheme.tertiary`, longBreak = `scheme.secondary`. `TimerDial` wraps the active colour in a 600 ms `ColorTween` (curve: easeOutCubic) so Focus -> Break visibly cross-fades the dial instead of snapping. New `TimerDial.accentFor(scheme, kind)` static helper exposes the mapping. The downstream `TweenAnimationBuilder<double>` for tick progress is preserved unchanged.
- Each `ColorScheme` (Light / Dark / Black OLED / Tomatito) now declares its own `tertiary` (and `onTertiary`) colour, distinct from `secondary`, so short and long breaks render in different hues on every theme. New contrast test asserts each theme's `tertiary` passes the 3:1 graphical-accent threshold against its surface.
- Closes part of the open "Period-transition animations" gap (severity downgraded from medium to low; the tick-sweep + final-tick celebration are still pending).

### Fixed

- StatisticsScreen now subscribes to `StatisticsRepository.changes` so the panel refreshes live when a focus period completes while the user is on the Stats tab (previously only re-fetched on tab switch). Subscription is cancelled in `dispose()`. Three widget tests cover empty state, populated state with the achievements grid, and the live-refresh path.

### Added

- Phase 3.x prettier markdown screens + expanded FAQ + reference links.
- `MarkdownDocScreen` ships a custom `MarkdownStyleSheet`: themed headings, generous paragraph spacing, `1.55` line height for body text, primary-coloured underlined links, dim italic blockquotes with a left accent border, soft code blocks. Content is constrained to a 720 dp column on wide windows so lines stay readable, wrapped in `SelectionArea` so users can copy quotes, and `onTapLink` now opens external references via `url_launcher`.
- FAQ in en + pt expanded with new sections: how to pick a focus length, caffeine (Smith 2002), music while focusing (Kämpfe 2011 meta-analysis), what strict mode is for, why your break feels unproductive, distraction handling via implementation intentions, do streaks help, sleep before tools. Every reference (Mark, Leroy, Berman, Buman, Gollwitzer, Trougakos, Albulescu, Costales, Lally, Smith, Kämpfe, Kaplan, Kleitman) is now a clickable link to a DOI or canonical source.

- Phase 3.x rich Statistics panel with achievements.
- New `CompletionRecord` value class + `StatisticsRepository.loadAllCompletions()` so the panel can group raw history by day-of-week, hour, etc.
- New `StatsAggregator` (pure Dart) computes hero metrics (today / week / total / sessions / current and longest streak / active days / best day / peak hour), a 7-day rolling chart, day-of-week distribution, and 24-bar hour-of-day distribution from the raw completion stream.
- New `Achievement` catalogue + `AchievementChecker`: 16 achievements covering session counts (1, 10, 50, 100, 500), accumulated focus (1h, 10h, 50h, 100h), streaks (3, 7, 30 days), and behavioural badges (early bird, night owl, weekend warrior, marathon day). Each entry tracks progress towards its target so locked tiles still show how close the user is.
- Redesigned `StatisticsScreen`: responsive hero grid (2/3/4 columns), weekly bar chart, day-of-week distribution chart, hour-of-day strip, and an achievements grid that highlights unlocked tiles and shows progress bars on locked ones. Pull-to-refresh recomputes from the repository.
- `FakeStatisticsRepository` seed expanded from 7 days to 28 with randomised hour-of-day so the panel has texture during UI work.
- New en + pt strings for every hero metric, chart heading, and the 16 achievement title/body pairs.
- Tests: 8 new `StatsAggregator` cases (empty, break filtering, dow/hour distribution, best day, rolling 7-day window, current and longest streak under different scenarios) + 7 new `AchievementChecker` cases (locked/unlocked transitions, marathon day boundary, early bird, night owl, weekend warrior weekday filtering, progress clamping). 105 total, all passing.

- Phase 3.x arc dial style + drop digit animation.
- AnimatedMinuteText drops the AnimatedSwitcher; the MM:SS value just changes in place when the engine emits a new tick. `FontFeature.tabularFigures` keeps the digits from shifting horizontally.
- New `DialStyle` enum (ticks / arc) + `dialStyleProvider` (StateProvider) + persistence in `SettingsRepository`. main loads and overrides the provider on boot.
- New `ArcPainter`: the full ring sits in inactive colour as a guide; the "remaining" portion overlays in active colour starting at the current elapsed angle and sweeps clockwise back to the start. As time passes the active arc shrinks; at completion only the inactive ring remains.
- TimerDial picks the painter via `ref.watch(dialStyleProvider)`.
- Settings → Dial section ships the picker (Ticks / Arc) in en + pt.
- Tests: dial-style round-trip in shared_prefs (90 total, all passing).

- Phase 3.x apply-now dialog + compact mode + title-bar persistence fix.
- `TimerEngine.updateConfig(SessionConfig, {applyToCurrent})` replaces the active config; if `applyToCurrent` and a period is in progress, the period's total duration is recomputed (and the period completes immediately when the new total is at or below the elapsed time). Both engines implement.
- SettingsScreen duration sliders commit on `Slider.onChangeEnd`; if a session is running/paused AND a duration changed, an "Apply to the current period?" dialog asks Apply now / Next period only. Internal slider previews still update live during drag.
- Tomatito theme label is now "Red" / "Vermelho" (l10n only; enum value stays `tomatito` to avoid migrating SharedPreferences).
- Maximize caption button replaced by a Compact-mode toggle (icon: `Icons.aspect_ratio_outlined` ↔ `Icons.open_in_full`). Click resizes the window between the saved bounds and a 280×340 compact size; double-tap on the title text does the same. New `compactModeProvider` (StateProvider) is session-only.
- Title-bar visibility on pushed routes (About, licence page, …) fixed: `_DesktopFrame` is now wrapped via `MaterialApp.builder` so it sits above the Navigator instead of inside the home route.
- Caption buttons drop `Tooltip` (which needs an Overlay ancestor that the new top-of-app position does not have) in favour of `Semantics(label:)` — visual hover state stays the same; screen readers still announce the action.
- New en + pt strings for the apply-now dialog and the compact-mode tooltips.

### Earlier in [Unreleased]

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
- Phase 3.x SessionCheckpoint and resume-after-kill (closes the high-severity GAPS item).
- `SessionCheckpoint` value object with JSON roundtrip and `isFreshAt(now)` (30 min spec window).
- `CheckpointStore` wraps a single JSON file in app docs dir; tolerant of missing or corrupt files; idempotent clear.
- `RealTimerEngine` accepts an optional `CheckpointStore` and writes the active state every 5 s during running periods, once on pause, clears on `start` / `reset`. New `restoreFromCheckpointIfFresh(config)` puts the engine into TimerPaused on next launch when the saved state is < 30 min old.
- `main()` constructs the store, creates the engine with it, and calls the restore on boot before runApp.
- Tests: SessionCheckpoint serialization + isFreshAt edges, CheckpointStore file roundtrip + corrupt + missing + idempotent clear, RealTimerEngine pause-writes-checkpoint / reset-clears / restore-paused / stale-cleared (77 tests total, all passing).
- New OPEN GAPS entry: explicit "Resume your interrupted focus period?" dialog (silent restore is the Phase 3.x default).
- Phase 3.x sound bank and chime playback (closes the medium-severity GAPS item).
- Three chimes bundled in `assets/sounds/` as small OGG Vorbis (soft_bell 7 KB, wood_block 5 KB, gentle_pulse 6 KB), generated locally with ffmpeg + libvorbis (recipes in DEVELOPMENT once recorded).
- `SoundBank` registry + `SoundPlayer` abstract with `JustAudioSoundPlayer` (production, swallows backend errors silently) and `NoOpSoundPlayer` (tests, unsupported platforms).
- `ChimeRecorder` plays the configured chime at the configured volume on every `TimerPeriodComplete`, alongside the platform notification.
- `SettingsRepository` extended with `loadChimeId` / `saveChimeId`, `loadChimeVolume` / `saveChimeVolume`; both repositories updated.
- SettingsScreen Sound section: chime picker (RadioGroup) + volume slider (0..100%); en + pt strings.
- Test: SoundBank id uniqueness, asset path discipline, byId lookup + default fallback, SoundOption equality (82 tests, all passing).
- New OPEN GAPS entries: tick-during-focus toggle, chime preview button.
- Phase 3.x Android persistent timer foreground service + Follow-system theme + url_launcher About links (closes the high-severity Android foreground service GAPS entry).
- `flutter_foreground_task` wired with a minimal TaskHandler entrypoint (`tomatitoForegroundTaskEntrypoint`, `@pragma('vm:entry-point')`); `AndroidNotificationService.updatePersistentTimer` / `clearPersistentTimer` start, update and stop the service.
- `PersistentNotificationRecorder` bridges the engine and the service, throttles notification updates to minute boundaries (no hundreds of cross-isolate calls per session), reacts to the Settings toggle, and requests POST_NOTIFICATIONS just-in-time on first enable.
- Settings → Notifications section (Android only) with Persistent timer notification toggle, persisted via SharedPreferences.
- Manifest declares FOREGROUND_SERVICE + FOREGROUND_SERVICE_DATA_SYNC + WAKE_LOCK.
- `AppThemeId.system` resolves to lightScheme / darkScheme via `MediaQuery.platformBrightnessOf` in `app.dart`. `AppThemes.schemeFor` and `themeFor` take an optional `Brightness`. Settings picker exposes the option (en + pt). `AppThemes.validatedSchemes` excludes `system` from contrast iteration tests.
- About screen: source-code and support-development tiles open external URLs via `url_launcher` (LaunchMode.externalApplication). Privacy + terms remain disabled pending hosted URLs or in-app markdown rendering.
- New tests: `loadPersistentNotification` / `saveChimeId` / `loadChimeVolume` round-trips in shared_prefs (84 tests, all passing).
- New OPEN GAPS entry: persistent notification action buttons (play/pause/skip from lock screen) deferred. Closed: Follow-system theme; downgraded to low: AboutScreen external links (privacy + terms only).
- Phase 3.x cleanup batch: closes five OPEN GAPS entries (resume dialog, Ctrl+, + Esc shortcuts, sound preview, stats weekday l10n, OEM battery mitigation) and downgrades the OEM entry to medium.
- `CheckpointRestoreResult({restored, staleDiscarded})` replaces the bool return of `RealTimerEngine.restoreFromCheckpointIfFresh`. Tests updated; new test for the no-checkpoint path.
- `BootstrapResult` value object + `bootstrapResultProvider`. main computes it from the restore result and the persisted OEM-tip-shown flag; TimerScreen reads it once on the first post-frame callback.
- TimerScreen "Resume your interrupted focus period?" AlertDialog when a fresh checkpoint was restored: Resume keeps the engine paused as restored; Start fresh calls `engine.reset()`. Mutually exclusive with the OEM tip.
- TimerScreen MaterialBanner OEM battery tip when a stale checkpoint was discarded: text-only ("Allow Tomatito to ignore battery optimisations"); dismiss persists `oem_tip_shown=true` so it never nags. The "Open battery settings" deep link is a separate follow-up.
- `navigationIndexProvider` (StateProvider) drives RootShell. Ctrl+, sets it to 2 (Settings). Esc pops the topmost route via `tomatitoNavigatorKey`.
- `soundPlayerProvider` exposes the platform-appropriate SoundPlayer. SettingsScreen adds a play icon on each chime tile that previews at the current volume.
- main calls `initializeDateFormatting()`. StatisticsScreen weekday labels render via `DateFormat('E', Localizations.localeOf(context).toString())`; pt now shows "seg, ter, qua, ..." instead of "Mon, Tue, ...".
- Tests: 86 total, all passing.
- Phase 3.x window state persistence + onboarding tour (closes two more OPEN GAPS entries).
- `DesktopWindowController` now accepts a `SharedPreferences`; persists and restores window bounds via `tomatito.window_bounds.v1`. main calls `restoreWindowState()` after `windowManager.ensureInitialized()` and registers a `_PersistOnMoveListener` that saves on every resize / move.
- `OnboardingScreen`: 4-page PageView (welcome + 3 tour pages) with Skip / Next, page indicator, and "Get started" on the last page. Persists `has_seen_onboarding` in SharedPreferences.
- `_RootRouter` in app.dart watches `onboardingNeededProvider` (StateProvider) and AnimatedSwitchers between OnboardingScreen and RootShell. About screen has "Show welcome tour again" tile that resets the flag.
- `SettingsRepository` extended with `loadHasSeenOnboarding` / `saveHasSeenOnboarding`; both repos updated; round-trip test added.
- Tests: 87 total, all passing.
- Phase 3.x Linux desktop notifications + tick sound during focus (closes two more OPEN GAPS entries).
- `LinuxNotificationService` (flutter_local_notifications via libnotify) shipping in `lib/platform/desktop/`. `showPeriodComplete` fires a libnotify notification; persistent / permission methods are no-ops since Linux has no foreground-service equivalent. main picks it via `_isLinux`.
- New `assets/sounds/tick_soft.ogg` (3.6 KB OGG Vorbis, 320 Hz, ~40 ms) generated with ffmpeg + libvorbis. `SoundBank.focusTick` constant (not in the chime picker).
- `TickRecorder` plays the tick at low volume (0.3) once per second during `TimerRunning(focus)` when the user enables the toggle; cancels otherwise.
- `SettingsRepository.loadTickEnabled` / `saveTickEnabled` (off by default). Settings Sound section gains a SwitchListTile with explanatory subtitle.
- Tests: tick-enabled round-trip in shared_prefs (88 total, all passing).
- Phase 3.x AboutScreen privacy + terms in-app + AppLifecycle owner (closes two more OPEN GAPS entries).
- Added `flutter_markdown ^0.7.0` and bundled `docs/PRIVACY_POLICY.md` + `docs/TERMS.md` directly via pubspec assets: the source-tree and the in-app version stay identical with no duplication.
- New `MarkdownDocScreen` (generic Scaffold + FutureBuilder + Markdown widget). About tiles route to it.
- New `AppLifecycle` class owns Stats / Chime / Persistent / Tick recorders with a real `dispose()` (replaces the no-op `_keepAlive`).
- New OPEN GAPS entry: flutter_markdown is discontinued by the Flutter team; track for swap to markdown_widget or hand-rolled rendering.
- Phase 3.x CI builds for Android debug + Linux desktop (partial close on the CI platform-builds GAPS entry).
- New `build-android` job: JDK 17 + flutter build apk --debug; uploads `tomatito-debug-apk` as a CI artifact.
- New `build-linux` job: installs clang, cmake, ninja-build, pkg-config, libgtk-3-dev, liblzma-dev, libstdc++-12-dev; enables Linux desktop; flutter build linux --release; uploads `tomatito-linux-x64` bundle as a CI artifact.
- Both new jobs gated on `analyze-and-test` so they only run when the analyze + test pipeline is green.
- The Windows build job (`windows-latest` + VS Build Tools) stays deferred for now; tracked in the same downgraded GAPS entry.
- Phase 3.x custom desktop title bar.
- main calls `windowManager.setTitleBarStyle(TitleBarStyle.hidden, windowButtonVisibility: false)` on Linux / macOS / Windows so Flutter owns the chrome.
- New `TomatitoTitleBar` widget: theme-coloured (uses `colorScheme.surface` + a 6 % bottom border), `DragToMoveArea` covers the title text on the left, double-tap toggles maximize / restore.
- Four caption buttons in order: pin (always-on-top), minimize, maximize / restore (icon swaps via WindowListener.onWindowMaximize / Unmaximize), close. The close button hovers Windows-style red. The pin tints with `colorScheme.primary` when active.
- New `alwaysOnTopProvider` (StateProvider) keeps the title bar pin and the Settings toggle in sync without either reaching into the other's local state. main overrides with the value loaded from `SettingsRepository` on boot.
- en + pt strings for the four button tooltips.
- Phase 3.x Tomatito red surface + OEM action button + locale picker + privacy/terms in pt.
- Tomatito ColorScheme.surface moved from `#FAF6F1` (warm off-white) to `#FFE0D5` (pale tomato) so the theme reads as red at a glance; contrast tests still pass for all colour pairs.
- New `android_intent_plus` dep. OEM banner now has an "Open battery settings" action that fires `IGNORE_BATTERY_OPTIMIZATION_SETTINGS` (falls back to `APPLICATION_DETAILS_SETTINGS` with `package:dev.kbrianps.tomatito`) alongside the existing dismiss action. The banner itself is now gated to Android only (was firing on desktop too).
- New `LocaleChoice` enum (system / en / pt) + `localeChoiceProvider`. main loads from `SettingsRepository.loadLocaleChoice` and overrides the provider; `MaterialApp.locale` watches it. Settings → Language section ships the picker (en + pt strings).
- Privacy policy and terms now have pt translations (`docs/PRIVACY_POLICY.pt.md`, `docs/TERMS.pt.md`); `MarkdownDocScreen.forLocale` picks the asset based on the active language code so the in-app docs follow the user's chosen language.
- Tests: locale-choice round-trip in shared_prefs (89 total, all passing).
- Closes GAPS: OEM tip "Open battery settings" deep link.
- Phase 3.x Tomatito truly red + rounded corners + F.A.Q. + skip button + MM:SS dial.
- Tomatito ColorScheme rebuilt: surface `#C0392B` (saturated tomato red), onSurface white, primary `#FFCFB8` (peach for visible accents on red), onPrimary `#3D1006` (dark red text), secondary `#FFD699` (warm yellow, since green doesn't read on red), brightness `Brightness.dark`. All ColorScheme contrast pairs still pass WCAG AA.
- Desktop: `_DesktopFrame` clips the app body with a 12 dp `ClipRRect`; `windowManager.setBackgroundColor(transparent)` so the rounded corners can show through on compositors that honour transparency. On compositors that do not, the rounded inner content still looks right against the OS-default window edge.
- `docs/FAQ.md` and `docs/FAQ.pt.md`: substantial evidence-based F.A.Q. covering why 25/5 is folklore, what research strongly supports (task switching cost, attention residue, attention restoration, movement, implementation intentions, micro-breaks), what doesn't work as well as people claim (specific 25/5 ratio, 90-min ultradian cycle, deep-work hour caps, 21-day habit), tick sound tradeoffs, 20-20-20 rule, what helps in practice, references. About screen routes via `MarkdownDocScreen.forLocale`; the old "Why these numbers?" ExpansionTile is dropped.
- ControlButtons third slot is now Skip (`Icons.skip_next`) instead of the More menu; TimerScreen wires `onSkip` to `engine.skip`.
- AnimatedMinuteText always renders MM:SS (no minutes-ceil rounding, no "min" suffix). Display is consistent throughout the period: 25:00 -> 24:59 -> ... -> 00:01 -> 00:00.
- TickPainter redesigned: `progress` drives a "remaining" highlight that depletes clockwise from 12 o'clock. At t=0 every tick is highlighted; as time passes, leading ticks dim. The `activeHighlightCount` parameter is gone. The widget test still passes since it only checks boundary-progress paints.
