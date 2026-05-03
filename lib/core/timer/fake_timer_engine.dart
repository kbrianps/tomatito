import 'dart:async';

import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';

/// In-memory timer engine for Phase 1. Drives the UI from a `Timer.periodic`
/// without the precision guarantees of a real ticker; good enough for a
/// designer to feel the app, not for production use.
///
/// `speedMultiplier` lets manual UI testing fast-forward through periods.
class FakeTimerEngine implements TimerEngine {
  FakeTimerEngine({
    this.tickInterval = const Duration(milliseconds: 100),
    this.speedMultiplier = 1.0,
  });

  final Duration tickInterval;
  final double speedMultiplier;

  final StreamController<TimerState> _controller =
      StreamController<TimerState>.broadcast();
  Timer? _ticker;

  SessionConfig _config = SessionConfig.pomodoroDefault;
  TimerState _current = const TimerIdle();
  PeriodKind? _currentKind;
  Duration _elapsed = Duration.zero;
  Duration _periodTotal = Duration.zero;
  int _cycle = 1;
  int _focusSessionsCompleted = 0;

  @override
  TimerState get current => _current;

  @override
  Stream<TimerState> get stream => _controller.stream;

  @override
  void start(SessionConfig config) {
    _config = config;
    _focusSessionsCompleted = 0;
    _cycle = 1;
    _startPeriod(PeriodKind.focus);
  }

  void _startPeriod(PeriodKind kind) {
    _currentKind = kind;
    _elapsed = Duration.zero;
    _periodTotal = _durationFor(kind);
    _emit(_runningState());
    _scheduleTicker();
  }

  Duration _durationFor(PeriodKind kind) => switch (kind) {
    PeriodKind.focus => _config.focus,
    PeriodKind.shortBreak => _config.shortBreak,
    PeriodKind.longBreak => _config.longBreak,
  };

  TimerRunning _runningState() => TimerRunning(
    kind: _currentKind!,
    elapsed: _elapsed,
    total: _periodTotal,
    cycle: _cycle,
    totalCycles: _config.cyclesBeforeLongBreak,
  );

  TimerPaused _pausedState() => TimerPaused(
    kind: _currentKind!,
    elapsed: _elapsed,
    total: _periodTotal,
    cycle: _cycle,
    totalCycles: _config.cyclesBeforeLongBreak,
  );

  void _scheduleTicker() {
    _ticker?.cancel();
    _ticker = Timer.periodic(tickInterval, (_) => _tick());
  }

  void _tick() {
    if (_currentKind == null) return;
    final stepUs = (tickInterval.inMicroseconds * speedMultiplier).round();
    _elapsed += Duration(microseconds: stepUs);
    if (_elapsed >= _periodTotal) {
      _ticker?.cancel();
      _ticker = null;
      _onPeriodComplete();
      return;
    }
    _emit(_runningState());
  }

  void _onPeriodComplete() {
    final completed = _currentKind!;
    PeriodKind? next;
    var willAutoStart = false;

    if (completed == PeriodKind.focus) {
      _focusSessionsCompleted++;
      final isLongBreakCycle =
          _focusSessionsCompleted % _config.cyclesBeforeLongBreak == 0;
      next = isLongBreakCycle ? PeriodKind.longBreak : PeriodKind.shortBreak;
      willAutoStart = _config.autoStartBreaks;
    } else if (completed == PeriodKind.longBreak) {
      next = null;
    } else {
      _cycle++;
      next = PeriodKind.focus;
      willAutoStart = _config.autoStartFocus;
    }

    _emit(TimerPeriodComplete(completed: completed, next: next));

    if (next == null) {
      _currentKind = null;
      _emit(const TimerIdle());
      return;
    }

    if (willAutoStart) {
      _startPeriod(next);
    } else {
      _currentKind = next;
      _elapsed = Duration.zero;
      _periodTotal = _durationFor(next);
      _emit(_pausedState());
    }
  }

  @override
  void pause() {
    if (_currentKind == null) return;
    if (_config.strictMode && _currentKind == PeriodKind.focus) {
      throw StateError('Cannot pause during strict focus.');
    }
    _ticker?.cancel();
    _ticker = null;
    _emit(_pausedState());
  }

  @override
  void resume() {
    if (_currentKind == null) return;
    _emit(_runningState());
    _scheduleTicker();
  }

  @override
  void skip() {
    if (_currentKind == null) return;
    _ticker?.cancel();
    _ticker = null;
    _onPeriodComplete();
  }

  @override
  void reset() {
    _ticker?.cancel();
    _ticker = null;
    _currentKind = null;
    _elapsed = Duration.zero;
    _periodTotal = Duration.zero;
    _cycle = 1;
    _focusSessionsCompleted = 0;
    _emit(const TimerIdle());
  }

  @override
  void updateConfig(SessionConfig newConfig, {bool applyToCurrent = false}) {
    _config = newConfig;
    if (!applyToCurrent || _currentKind == null) return;
    _periodTotal = _durationFor(_currentKind!);
    if (_elapsed >= _periodTotal) {
      _ticker?.cancel();
      _ticker = null;
      _onPeriodComplete();
      return;
    }
    if (_ticker != null) {
      _emit(_runningState());
    } else {
      _emit(_pausedState());
    }
  }

  @override
  Future<void> dispose() async {
    _ticker?.cancel();
    await _controller.close();
  }

  void _emit(TimerState state) {
    _current = state;
    _controller.add(state);
  }
}
