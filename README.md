# Tomatito

Focus, with a pinch of science.

Tomatito is a lightweight, native-feeling Pomodoro timer for Linux, Windows, macOS, Android — and now also runs in the browser. The visual and functional north star is the Windows 11 Clock app's Focus Sessions widget, expanded to be cross-platform, fully customisable, scientifically honest and visibly more polished in motion.

> **Status:** Phase 3.x. Timer engine, custom dial (ticks + arc styles), stats panel with achievements, themes (Light / Dark / Black OLED / Red / Follow system), system tray + minimize-to-tray, OS autostart, foreground service on Android, end-of-period chimes, full localisation (en + pt). Web target works with localStorage persistence.

## Highlights

- **Real timer engine** with a `Stopwatch` (immune to `Timer` drift) and a 5-second on-disk checkpoint so a kill mid-focus does not lose your place.
- **Stats panel** with hero metrics (today / week / total / current and longest streak / active days / best day / peak hour), 7-day chart, day-of-week distribution, 24-bar hour-of-day distribution, and 16 achievements.
- **Custom dial** in two styles: 30 ticks (default) or a sweeping arc. Active accent cross-fades between focus and break colours over 600 ms.
- **Compact mode** (240 x 320 micro-window, like Windows 11 Clock Focus). Drag the title bar, click the compact button, or double-tap the title.
- **Sound bank** (soft bell, wood block, gentle pulse) with a Preview button per option, plus an optional faint focus-tick at low volume.
- **System tray** with Show / Quit menu (asks first time whether minimize sends to tray or taskbar; preference is stored).
- **Launch on login** on Linux, macOS and Windows via `launch_at_startup`.
- **Linux desktop notifications** via libnotify; **Android persistent notification** via a foreground service.
- **No telemetry, no accounts, no internet permission, no ads.** Stats are local-only.

## Install

| Platform | Download |
|----------|----------|
| Linux    | _AppImage / Flatpak at v1._ Run from source: `flutter run -d linux` |
| Windows  | _MSIX at v1._ Run from source: `flutter run -d windows` |
| macOS    | _Run from source while not signed_: `flutter run -d macos` |
| Android  | _Coming to Google Play at v1._ Build APK: `flutter build apk --debug` |
| Web      | Browser preview: `flutter run -d chrome`, or static build: `flutter build web` |

The web build is a no-install preview; everything is fully functional except the desktop-only window features (pin, minimize, compact mode, tray, autostart) and the Android-only foreground service. Stats persist via `localStorage` (cleared if the user wipes browser data).

## Permissions

| Permission | Why we ask | When we ask |
|------------|-----------|-------------|
| Notifications (Android) | Persistent timer notification, end-of-period chimes | Only when you enable the persistent notification toggle |
| Foreground service (Android) | Keep the timer accurate when the screen is off | Granted automatically once notifications are allowed |
| Vibrate (Android) | Optional vibration on chime | Only if you turn on vibration |

No internet permission. No analytics. No ads. Ever.

## Privacy

Tomatito stores all data on your device. No accounts, no telemetry, no third-party SDKs. Read the full [privacy policy](docs/PRIVACY_POLICY.md).

## Keyboard shortcuts (desktop)

| Shortcut | Action |
|----------|--------|
| Space | Play / Pause |
| Ctrl+R | Reset |
| Ctrl+S | Skip current period |
| Ctrl+, | Open Settings |
| Esc | Close modal / leave compact mode |

## FAQ

**Is the 25/5 split the "right" Pomodoro?**
No. Francesco Cirillo picked it in the 1980s because his kitchen timer was tomato-shaped. Research supports the rhythm of timed focus then deliberate rest, not specific numbers. Try 50/10 or 90/20 if you want longer focus blocks. The full [FAQ](docs/FAQ.md) goes deeper, with linked references.

**Why do you need notifications?**
Only for the persistent timer notification and the end-of-period chime, both opt-in. Tomatito works fully without them.

**Will my data sync across devices?**
No. By design. Stats live on the device (filesystem on desktop / Android, localStorage on web).

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for architecture, build instructions, test layout, release process and decision records.

The full Phase-by-Phase progress and what is intentionally deferred lives in [docs/GAPS.md](docs/GAPS.md). [CHANGELOG.md](CHANGELOG.md) tracks every commit on the unreleased line.

Tests run with `flutter test` (119 tests as of this commit; analyze 0 issues). Lint baseline is `very_good_analysis` strict.

## License

MIT. See [LICENSE](LICENSE).
