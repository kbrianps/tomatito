import 'dart:async';

import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/data/statistics_repository.dart';

/// Bridges the `TimerEngine` and the `StatisticsRepository`. Subscribes to
/// the engine's stream and records each completed focus period. Lives for
/// the lifetime of the app; created in `main()`.
class StatsRecorder {
  StatsRecorder({
    required TimerEngine engine,
    required StatisticsRepository stats,
    required SettingsRepository settings,
  }) : _engine = engine,
       _stats = stats,
       _settings = settings;

  final TimerEngine _engine;
  final StatisticsRepository _stats;
  final SettingsRepository _settings;

  StreamSubscription<TimerState>? _sub;

  void start() {
    _sub = _engine.stream.listen(_handle);
  }

  Future<void> dispose() async {
    await _sub?.cancel();
  }

  Future<void> _handle(TimerState state) async {
    if (state is! TimerPeriodComplete) return;
    if (state.completed != PeriodKind.focus) return;
    final config = await _settings.loadSessionConfig();
    final duration = _durationFor(state.completed, config);
    await _stats.recordCompletion(
      kind: state.completed,
      duration: duration,
      endedAtLocal: DateTime.now(),
    );
  }

  Duration _durationFor(PeriodKind kind, SessionConfig config) =>
      switch (kind) {
        PeriodKind.focus => config.focus,
        PeriodKind.shortBreak => config.shortBreak,
        PeriodKind.longBreak => config.longBreak,
      };
}
