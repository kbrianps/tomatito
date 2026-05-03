import 'dart:convert';

import 'package:flutter/widgets.dart' show Offset, Rect, Size;
import 'package:shared_preferences/shared_preferences.dart';

import 'package:tomatito/core/window/window_controller.dart';
import 'package:window_manager/window_manager.dart';

/// Production WindowController for Linux, macOS and Windows. Backed by
/// `window_manager`. Persists size + position across launches via the
/// supplied SharedPreferences.
class DesktopWindowController implements WindowController {
  DesktopWindowController(this._prefs);

  final SharedPreferences _prefs;
  static const String _keyBounds = 'tomatito.window_bounds.v1';

  @override
  Future<void> setAlwaysOnTop({required bool value}) =>
      windowManager.setAlwaysOnTop(value);

  @override
  Future<void> setCompactMode({required bool value, Size? compactSize}) async {
    // Phase 3.x follow-up: switch to a compact-mode route + resize the window.
  }

  @override
  Future<void> persistWindowState() async {
    try {
      final bounds = await windowManager.getBounds();
      final json = <String, dynamic>{
        'x': bounds.left,
        'y': bounds.top,
        'w': bounds.width,
        'h': bounds.height,
      };
      await _prefs.setString(_keyBounds, jsonEncode(json));
    } on Object {
      // Ignore failures; window state is a nice-to-have, never crash on it.
    }
  }

  @override
  Future<void> restoreWindowState() async {
    final raw = _prefs.getString(_keyBounds);
    if (raw == null) return;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final x = (json['x'] as num).toDouble();
      final y = (json['y'] as num).toDouble();
      final w = (json['w'] as num).toDouble();
      final h = (json['h'] as num).toDouble();
      await windowManager.setBounds(Rect.fromLTWH(x, y, w, h));
      await windowManager.setPosition(Offset(x, y));
    } on Object {
      // Ignore corrupt or invalid bounds; the window opens at OS-default.
    }
  }
}
