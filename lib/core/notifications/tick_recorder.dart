import 'dart:async';

import 'package:tomatito/core/sound/sound_bank.dart';
import 'package:tomatito/core/sound/sound_player.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/data/settings_repository.dart';

/// Plays a soft tick once per second during a running focus period when the
/// user has enabled the optional tick toggle. Off by default per spec; the
/// volume is fixed lower than the configured chime volume so it never
/// startles. Cancels itself the moment the engine leaves running-focus.
class TickRecorder {
  TickRecorder({
    required TimerEngine engine,
    required SoundPlayer soundPlayer,
    required SettingsRepository settings,
  }) : _engine = engine,
       _soundPlayer = soundPlayer,
       _settings = settings;

  final TimerEngine _engine;
  final SoundPlayer _soundPlayer;
  final SettingsRepository _settings;

  StreamSubscription<TimerState>? _engineSub;
  StreamSubscription<void>? _settingsSub;
  Timer? _ticker;
  bool _enabled = false;

  Future<void> start() async {
    _enabled = await _settings.loadTickEnabled();
    _engineSub = _engine.stream.listen(_handleEngine);
    _settingsSub = _settings.changes.listen((_) async {
      _enabled = await _settings.loadTickEnabled();
      await _handleEngine(_engine.current);
    });
  }

  Future<void> dispose() async {
    _ticker?.cancel();
    await _engineSub?.cancel();
    await _settingsSub?.cancel();
  }

  Future<void> _handleEngine(TimerState state) async {
    if (!_enabled || state is! TimerRunning || state.kind != PeriodKind.focus) {
      _ticker?.cancel();
      _ticker = null;
      return;
    }
    if (_ticker != null) return;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      // Volume is intentionally low: the chime volume setting controls
      // the end-of-period sound; the tick sits below that floor.
      _soundPlayer.play(SoundBank.focusTick, volume: 0.3);
    });
  }
}
