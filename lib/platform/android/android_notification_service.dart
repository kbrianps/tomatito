import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/platform/android/foreground_task_handler.dart';

/// Production NotificationService for Android. Plays end-of-period chimes
/// via flutter_local_notifications and runs a persistent timer foreground
/// service via flutter_foreground_task while a session is active. The
/// foreground service prevents Android from killing the app process during
/// long focus periods, addressing the spec's resilience requirement.
class AndroidNotificationService implements NotificationService {
  AndroidNotificationService();

  static const String _chimeChannelId = 'tomatito.period_complete';
  static const String _chimeChannelName = 'Period complete';
  static const String _chimeChannelDescription =
      'Plays a short chime when a focus or break period ends.';

  static const String _persistentChannelId = 'tomatito.persistent_timer';
  static const String _persistentChannelName = 'Persistent timer';
  static const String _persistentChannelDescription =
      'Keeps the timer accurate when the screen is off.';

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _localInitialized = false;
  bool _foregroundInitialized = false;

  Future<void> _ensureLocalInitialized() async {
    if (_localInitialized) return;
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _plugin.initialize(settings);
    _localInitialized = true;
  }

  void _ensureForegroundInitialized() {
    if (_foregroundInitialized) return;
    FlutterForegroundTask.initCommunicationPort();
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: _persistentChannelId,
        channelName: _persistentChannelName,
        channelDescription: _persistentChannelDescription,
      ),
      iosNotificationOptions: const IOSNotificationOptions(),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(5000),
      ),
    );
    _foregroundInitialized = true;
  }

  @override
  Future<void> showPeriodComplete({required PeriodKind completed}) async {
    await _ensureLocalInitialized();
    final (title, body) = _chimeTextFor(completed);
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

  (String, String) _chimeTextFor(PeriodKind kind) => switch (kind) {
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
    _ensureForegroundInitialized();
    final title = _persistentTitleFor(kind, isPaused: isPaused);
    final text = _persistentTextFor(remaining);
    final isRunning = await FlutterForegroundTask.isRunningService;
    if (isRunning) {
      await FlutterForegroundTask.updateService(
        notificationTitle: title,
        notificationText: text,
      );
    } else {
      await FlutterForegroundTask.startService(
        notificationTitle: title,
        notificationText: text,
        callback: tomatitoForegroundTaskEntrypoint,
      );
    }
  }

  String _persistentTitleFor(PeriodKind kind, {required bool isPaused}) {
    final base = switch (kind) {
      PeriodKind.focus => 'Focus',
      PeriodKind.shortBreak => 'Short break',
      PeriodKind.longBreak => 'Long break',
    };
    return isPaused ? '$base (paused)' : base;
  }

  String _persistentTextFor(Duration remaining) {
    if (remaining.inSeconds < 60) {
      final s = remaining.inSeconds.clamp(0, 59);
      return '00:${s.toString().padLeft(2, '0')} remaining';
    }
    final minutes = (remaining.inSeconds / 60).ceil();
    return '$minutes min remaining';
  }

  @override
  Future<void> clearPersistentTimer() async {
    if (!_foregroundInitialized) return;
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.stopService();
    }
  }

  @override
  Future<bool> requestPermissionIfNeeded() async {
    await _ensureLocalInitialized();
    final android =
        _plugin
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >();
    if (android == null) return false;
    final granted = await android.requestNotificationsPermission() ?? false;
    return granted;
  }
}
