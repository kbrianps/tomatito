import 'dart:async';

import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/data/settings_repository.dart';

/// Bridges the `TimerEngine`, `SettingsRepository` and `NotificationService`
/// for the persistent timer notification (Android foreground service). The
/// recorder is a no-op until the user enables the toggle in Settings; once
/// enabled, it requests permission and updates the notification text only
/// when the displayed string would actually change (throttled to minute
/// boundaries to avoid hundreds of cross-isolate calls per session).
class PersistentNotificationRecorder {
  PersistentNotificationRecorder({
    required TimerEngine engine,
    required NotificationService notifications,
    required SettingsRepository settings,
  }) : _engine = engine,
       _notifications = notifications,
       _settings = settings;

  final TimerEngine _engine;
  final NotificationService _notifications;
  final SettingsRepository _settings;

  StreamSubscription<TimerState>? _engineSub;
  StreamSubscription<void>? _settingsSub;
  bool _enabled = false;
  String _lastDisplayed = '';

  Future<void> start() async {
    _enabled = await _settings.loadPersistentNotification();
    if (_enabled) {
      await _notifications.requestPermissionIfNeeded();
    }
    _engineSub = _engine.stream.listen(_handleEngine);
    _settingsSub = _settings.changes.listen(_handleSettingsChange);
    await _handleEngine(_engine.current);
  }

  Future<void> dispose() async {
    await _engineSub?.cancel();
    await _settingsSub?.cancel();
  }

  Future<void> _handleEngine(TimerState state) async {
    if (!_enabled) return;
    final s = state;
    if (s is TimerRunning) {
      await _maybeUpdate(kind: s.kind, remaining: s.remaining, isPaused: false);
    } else if (s is TimerPaused) {
      await _maybeUpdate(kind: s.kind, remaining: s.remaining, isPaused: true);
    } else if (s is TimerIdle) {
      _lastDisplayed = '';
      await _notifications.clearPersistentTimer();
    }
  }

  Future<void> _maybeUpdate({
    required PeriodKind kind,
    required Duration remaining,
    required bool isPaused,
  }) async {
    final String minutesShown;
    if (remaining.inSeconds < 60) {
      final s = remaining.inSeconds.clamp(0, 59).toString().padLeft(2, '0');
      minutesShown = '00:$s';
    } else {
      minutesShown = '${(remaining.inSeconds / 60).ceil()}';
    }
    final key = '${kind.name}|$minutesShown|$isPaused';
    if (key == _lastDisplayed) return;
    _lastDisplayed = key;
    await _notifications.updatePersistentTimer(
      kind: kind,
      remaining: remaining,
      isPaused: isPaused,
    );
  }

  Future<void> _handleSettingsChange(void _) async {
    final newEnabled = await _settings.loadPersistentNotification();
    if (newEnabled == _enabled) return;
    _enabled = newEnabled;
    if (!_enabled) {
      _lastDisplayed = '';
      await _notifications.clearPersistentTimer();
    } else {
      await _notifications.requestPermissionIfNeeded();
      await _handleEngine(_engine.current);
    }
  }
}
