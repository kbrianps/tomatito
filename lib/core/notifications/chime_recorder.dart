import 'dart:async';

import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';

/// Bridges the `TimerEngine` and the `NotificationService`. On every
/// TimerPeriodComplete, fires the end-of-period chime. Lives for the
/// lifetime of the app; created in `main()`.
class ChimeRecorder {
  ChimeRecorder({
    required TimerEngine engine,
    required NotificationService notifications,
  }) : _engine = engine,
       _notifications = notifications;

  final TimerEngine _engine;
  final NotificationService _notifications;

  StreamSubscription<TimerState>? _sub;

  void start() {
    _sub = _engine.stream.listen(_handle);
  }

  Future<void> dispose() async {
    await _sub?.cancel();
  }

  Future<void> _handle(TimerState state) async {
    if (state is! TimerPeriodComplete) return;
    await _notifications.showPeriodComplete(completed: state.completed);
  }
}
