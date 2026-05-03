import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/timer/period_kind.dart';

/// Phase 1 stub. Real Android implementation lands in Phase 3.
class NoOpNotificationService implements NotificationService {
  NoOpNotificationService();

  @override
  Future<void> showPeriodComplete({required PeriodKind completed}) async {}

  @override
  Future<void> updatePersistentTimer({
    required PeriodKind kind,
    required Duration remaining,
    required bool isPaused,
  }) async {}

  @override
  Future<void> clearPersistentTimer() async {}

  @override
  Future<bool> requestPermissionIfNeeded() async => true;
}
