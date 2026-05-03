import 'dart:async';

import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/sound/sound_bank.dart';
import 'package:tomatito/core/sound/sound_player.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/data/settings_repository.dart';

/// Bridges the `TimerEngine`, `NotificationService` and `SoundPlayer`. On
/// every TimerPeriodComplete, fires the platform notification AND plays the
/// configured chime sound. Lives for the lifetime of the app; created in
/// `main()`.
class ChimeRecorder {
  ChimeRecorder({
    required TimerEngine engine,
    required NotificationService notifications,
    required SoundPlayer soundPlayer,
    required SettingsRepository settings,
  }) : _engine = engine,
       _notifications = notifications,
       _soundPlayer = soundPlayer,
       _settings = settings;

  final TimerEngine _engine;
  final NotificationService _notifications;
  final SoundPlayer _soundPlayer;
  final SettingsRepository _settings;

  StreamSubscription<TimerState>? _sub;

  void start() {
    _sub = _engine.stream.listen(_handle);
  }

  Future<void> dispose() async {
    await _sub?.cancel();
    await _soundPlayer.dispose();
  }

  Future<void> _handle(TimerState state) async {
    if (state is! TimerPeriodComplete) return;
    await _notifications.showPeriodComplete(completed: state.completed);
    final id = await _settings.loadChimeId();
    final volume = await _settings.loadChimeVolume();
    await _soundPlayer.play(SoundBank.byId(id), volume: volume);
  }
}
