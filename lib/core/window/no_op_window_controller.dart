import 'package:flutter/widgets.dart' show Size;

import 'package:tomatito/core/window/window_controller.dart';

/// Phase 1 stub. Real desktop implementation lands in Phase 3.
class NoOpWindowController implements WindowController {
  NoOpWindowController();

  @override
  Future<void> setAlwaysOnTop({required bool value}) async {}

  @override
  Future<void> setCompactMode({required bool value, Size? compactSize}) async {}

  @override
  Future<void> persistWindowState() async {}

  @override
  Future<void> restoreWindowState() async {}
}
