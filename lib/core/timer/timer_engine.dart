import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_state.dart';

/// Pure-Dart timer abstraction. The Flutter UI subscribes to [stream] and
/// calls these methods; nothing else may touch wall-clock time.
///
/// Real implementation lands in Phase 2 (`RealTimerEngine`, ticker-based).
/// Phase 1 wires the UI against a `FakeTimerEngine` that drives transitions
/// from in-memory state.
abstract class TimerEngine {
  Stream<TimerState> get stream;
  TimerState get current;

  /// Begin a new session with the given configuration.
  void start(SessionConfig config);

  /// Pause the current period. Honours [SessionConfig.strictMode]: during
  /// strict focus this throws [StateError].
  void pause();

  void resume();

  /// Skip the current period and advance to the next.
  void skip();

  /// Reset to [TimerIdle], discarding the running session.
  void reset();

  /// Replace the active session config. If [applyToCurrent] is true and
  /// a period is currently running or paused, the period's total duration
  /// is recomputed from [newConfig] for its kind; if the new total is at
  /// or below the elapsed time, the period completes immediately. If
  /// [applyToCurrent] is false, the change takes effect on the next period.
  void updateConfig(SessionConfig newConfig, {bool applyToCurrent = false});

  Future<void> dispose();
}

/// Override this provider in `main()` with a real implementation. Phase 0
/// throws on access so callers know the engine is not yet wired.
final timerEngineProvider = Provider<TimerEngine>((ref) {
  throw UnimplementedError(
    'timerEngineProvider has no binding. Override it in main() or in tests.',
  );
});
