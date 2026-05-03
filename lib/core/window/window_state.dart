import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether the desktop window is pinned on top of other windows. Owned at
/// the app scope so the title bar pin button and the Settings toggle stay
/// in sync without either reaching into the other's local state. main()
/// overrides with the value loaded from `SettingsRepository`.
final alwaysOnTopProvider = StateProvider<bool>((ref) => false);

/// Whether the desktop window is currently in compact mode (a small
/// focused window mimicking the Windows 11 Clock Focus widget).
/// Session-only state; not persisted.
final compactModeProvider = StateProvider<bool>((ref) => false);
