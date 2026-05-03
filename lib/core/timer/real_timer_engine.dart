import 'dart:async';

import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';

/// Production timer engine. Uses a `Stopwatch` to track elapsed accurately
/// across pauses (immune to Timer drift) and a `Timer.periodic` purely as a
/// tick beat for emitting state updates to the UI.
///
/// Checkpointing for resume-after-kill is deferred to Phase 2.x; see GAPS.
class RealTimerEngine implements TimerEngine {
  RealTimerEngine({this.tickInterval = const Duration(milliseconds: 100)});

  final Duration tickInterval;

  final StreamController<TimerState> _controller =
      StreamController<TimerState>.broadcast();
  final Stopwatch _stopwatch = Stopwatch();
  Timer? _ticker;

  SessionConfig _config = SessionConfig.pomodoroDefault;
  TimerState _current = const TimerIdle();
  PeriodKind? _currentKind;
  Duration _baseElapsed = Duration.zero;
  Duration _periodTotal = Duration.zero;
  int _cycle = 1;
  int _focusSessionsCompleted = 0;

  @override
  TimerState get current => _current;

  @override
  Stream<TimerState> get stream => _controller.stream;

  Duration get _elapsed => _baseElapsed + _stopwatch.elapsed;

  @override
  void start(SessionConfig config) {
    _config = config;
    _focusSessionsCompleted = 0;
    _cycle = 1;
    _startPeriod(PeriodKind.focus);
  }

  void _startPeriod(PeriodKind kind) {
    _currentKind = kind;
    _baseElapsed = Duration.zero;
    _stopwatch
      ..reset()
      ..start();
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
    if (_elapsed >= _periodTotal) {
      _ticker?.cancel();
      _ticker = null;
      _stopwatch.stop();
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
      _baseElapsed = Duration.zero;
      _stopwatch
        ..stop()
        ..reset();
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
    _baseElapsed += _stopwatch.elapsed;
    _stopwatch
      ..stop()
      ..reset();
    _ticker?.cancel();
    _ticker = null;
    _emit(_pausedState());
  }

  @override
  void resume() {
    if (_currentKind == null) return;
    _stopwatch.start();
    _emit(_runningState());
    _scheduleTicker();
  }

  @override
  void skip() {
    if (_currentKind == null) return;
    _ticker?.cancel();
    _ticker = null;
    _stopwatch.stop();
    _onPeriodComplete();
  }

  @override
  void reset() {
    _ticker?.cancel();
    _ticker = null;
    _stopwatch
      ..stop()
      ..reset();
    _currentKind = null;
    _baseElapsed = Duration.zero;
    _periodTotal = Duration.zero;
    _cycle = 1;
    _focusSessionsCompleted = 0;
    _emit(const TimerIdle());
  }

  @override
  Future<void> dispose() async {
    _ticker?.cancel();
    _stopwatch.stop();
    await _controller.close();
  }

  void _emit(TimerState state) {
    _current = state;
    _controller.add(state);
  }
}
