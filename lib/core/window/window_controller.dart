import 'package:flutter/widgets.dart' show Size;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Desktop-only window helper. On Android this is wired to a no-op so calling
/// code can stay platform-unaware.
abstract class WindowController {
  Future<void> setAlwaysOnTop({required bool value});
  Future<void> setCompactMode({required bool value, Size? compactSize});
  Future<void> persistWindowState();
  Future<void> restoreWindowState();
}

final windowControllerProvider = Provider<WindowController>((ref) {
  throw UnimplementedError(
    'windowControllerProvider has no binding. Override it in main().',
  );
});
