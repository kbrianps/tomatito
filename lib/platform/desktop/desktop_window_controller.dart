import 'package:flutter/widgets.dart' show Size;

import 'package:tomatito/core/window/window_controller.dart';
import 'package:window_manager/window_manager.dart';

/// Production WindowController for Linux, macOS and Windows. Backed by
/// `window_manager`. Only setAlwaysOnTop is wired in Phase 3; compact mode
/// and window-state persistence ship in Phase 3.x (see GAPS).
class DesktopWindowController implements WindowController {
  DesktopWindowController();

  @override
  Future<void> setAlwaysOnTop({required bool value}) =>
      windowManager.setAlwaysOnTop(value);

  @override
  Future<void> setCompactMode({required bool value, Size? compactSize}) async {
    // Phase 3.x: switch to a compact-mode route + resize the window.
  }

  @override
  Future<void> persistWindowState() async {
    // Phase 3.x: save current size + position to SharedPreferences.
  }

  @override
  Future<void> restoreWindowState() async {
    // Phase 3.x: read saved size + position and apply via window_manager.
  }
}
