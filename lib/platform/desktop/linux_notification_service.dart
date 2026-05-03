import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/timer/period_kind.dart';

/// Linux NotificationService backed by `flutter_local_notifications`, which
/// uses libnotify under the hood. Only the end-of-period chime is wired:
/// Linux has no equivalent of Android's foreground service, so the
/// persistent timer / permission methods are intentional no-ops.
class LinuxNotificationService implements NotificationService {
  LinuxNotificationService();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    const settings = InitializationSettings(
      linux: LinuxInitializationSettings(defaultActionName: 'Open'),
    );
    await _plugin.initialize(settings);
    _initialized = true;
  }

  @override
  Future<void> showPeriodComplete({required PeriodKind completed}) async {
    await _ensureInitialized();
    final (title, body) = _textFor(completed);
    await _plugin.show(
      0,
      title,
      body,
      const NotificationDetails(linux: LinuxNotificationDetails()),
    );
  }

  (String, String) _textFor(PeriodKind kind) => switch (kind) {
    PeriodKind.focus => ('Focus complete', 'Time for a break.'),
    PeriodKind.shortBreak => ('Break complete', 'Ready to focus.'),
    PeriodKind.longBreak => ('Long break complete', 'Ready when you are.'),
  };

  @override
  Future<void> updatePersistentTimer({
    required PeriodKind kind,
    required Duration remaining,
    required bool isPaused,
  }) async {
    // Linux has no equivalent of Android's foreground service.
  }

  @override
  Future<void> clearPersistentTimer() async {}

  @override
  Future<bool> requestPermissionIfNeeded() async => true;
}
