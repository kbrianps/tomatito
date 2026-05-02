import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tomatito/core/timer/period_kind.dart';

/// Surfaces end-of-period chimes and the persistent timer notification.
/// Phase 3 ships an Android implementation backed by `flutter_foreground_task`
/// and `flutter_local_notifications`. Desktop is a no-op for now.
abstract class NotificationService {
  Future<void> showPeriodComplete({required PeriodKind completed});

  Future<void> updatePersistentTimer({
    required PeriodKind kind,
    required Duration remaining,
    required bool isPaused,
  });

  Future<void> clearPersistentTimer();

  /// Just-in-time permission request. Spec: only call this when the user
  /// enables the persistent notification toggle for the first time. Never
  /// prompt on first launch.
  Future<bool> requestPermissionIfNeeded();
}

final notificationServiceProvider = Provider<NotificationService>((ref) {
  throw UnimplementedError(
    'notificationServiceProvider has no binding. Override it in main().',
  );
});
