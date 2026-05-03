import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:launch_at_startup/launch_at_startup.dart';

/// Cross-platform autostart manager. Uses `launch_at_startup` so the
/// same enable / disable / isEnabled API works on Linux (writes a
/// freedesktop `~/.config/autostart/*.desktop`), macOS (registers a
/// LaunchAgent under `~/Library/LaunchAgents`) and Windows (writes a
/// `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` registry key).
///
/// Mobile and web platforms are not supported by the upstream package;
/// the methods here no-op on those, mirroring the previous behaviour.
class AutostartManager {
  AutostartManager();

  bool _setupDone = false;

  bool get _supported =>
      !kIsWeb &&
      (Platform.isLinux || Platform.isMacOS || Platform.isWindows);

  void _ensureSetup() {
    if (_setupDone || !_supported) return;
    launchAtStartup.setup(
      appName: 'Tomatito',
      appPath: Platform.resolvedExecutable,
      packageName: 'dev.kbrianps.tomatito',
    );
    _setupDone = true;
  }

  Future<bool> isEnabled() async {
    if (!_supported) return false;
    try {
      _ensureSetup();
      return await launchAtStartup.isEnabled();
    } on Object {
      return false;
    }
  }

  Future<void> enable() async {
    if (!_supported) return;
    try {
      _ensureSetup();
      await launchAtStartup.enable();
    } on Object {
      // Best-effort: a missing registry key, sandboxed macOS, or a
      // broken HOME env should not crash the app.
    }
  }

  Future<void> disable() async {
    if (!_supported) return;
    try {
      _ensureSetup();
      await launchAtStartup.disable();
    } on Object {
      // Best-effort cleanup.
    }
  }
}
