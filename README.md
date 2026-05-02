# Tomatito

Focus, with a pinch of science.

Tomatito is a lightweight, native-feeling Pomodoro timer for Windows, Linux and Android. The visual and functional north star is the Windows 11 Clock app's Focus Sessions widget, expanded to be cross-platform, fully customisable, scientifically honest and visibly more polished in motion.

> **Status:** Phase 0 scaffolding. The project structure, lint rules, CI, theme tokens, l10n infrastructure and abstract interfaces are in place. The timer UI lands in Phase 1.

## Screenshots

_Pending Phase 1._

## Install

| Platform | Download |
|----------|----------|
| Android  | _Coming to Google Play at v1._ |
| Linux    | _AppImage / Flatpak at v1._ |
| Windows  | _MSIX or folder build at v1._ |

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
No. Francesco Cirillo picked it in the 1980s because his kitchen timer was tomato-shaped. Research supports the rhythm of timed focus then deliberate rest, not specific numbers. Try 50/10 or 90/20 if you want longer focus blocks. The "Why these numbers?" panel in Settings goes deeper.

**Why do you need notifications?**
Only for the persistent timer notification and the end-of-period chime, both opt-in. Tomatito works fully without them.

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for architecture, build instructions, test layout, release process and decision records.

The list of known gaps and deferred features lives in [docs/GAPS.md](docs/GAPS.md).

## License

MIT. See [LICENSE](LICENSE).
