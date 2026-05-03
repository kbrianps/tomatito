import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/timer/period_kind.dart';

/// Production NotificationService for Android. Phase 3 wires the chime
/// (end-of-period notification) only. The persistent timer notification +
/// foreground service land in Phase 3.x; see GAPS.
class AndroidNotificationService implements NotificationService {
  AndroidNotificationService();

  static const String _chimeChannelId = 'tomatito.period_complete';
  static const String _chimeChannelName = 'Period complete';
  static const String _chimeChannelDescription =
      'Plays a short chime when a focus or break period ends.';

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
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
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _chimeChannelId,
          _chimeChannelName,
          channelDescription: _chimeChannelDescription,
          importance: Importance.high,
          priority: Priority.high,
          category: AndroidNotificationCategory.alarm,
        ),
      ),
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
    // Phase 3.x: requires flutter_foreground_task wiring.
  }

  @override
  Future<void> clearPersistentTimer() async {
    // Phase 3.x: requires flutter_foreground_task wiring.
  }

  @override
  Future<bool> requestPermissionIfNeeded() async {
    await _ensureInitialized();
    final android =
        _plugin
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >();
    if (android == null) return false;
    return await android.requestNotificationsPermission() ?? false;
  }
}
