// ignore_for_file: cascade_invocations

import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/real_timer_engine.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_state.dart';

void main() {
  group('RealTimerEngine', () {
    test('starts in TimerIdle', () {
      final engine = RealTimerEngine();
      expect(engine.current, isA<TimerIdle>());
    });

    test('start() emits TimerRunning with focus immediately', () async {
      final engine = RealTimerEngine();
      final states = <TimerState>[];
      final sub = engine.stream.listen(states.add);
      engine.start(SessionConfig.pomodoroDefault);
      await Future<void>.delayed(Duration.zero);
      expect(states, isNotEmpty);
      final first = states.first;
      expect(first, isA<TimerRunning>());
      expect((first as TimerRunning).kind, PeriodKind.focus);
      await sub.cancel();
      await engine.dispose();
    });

    test('reset() returns engine to TimerIdle', () async {
      final engine = RealTimerEngine();
      engine.start(SessionConfig.pomodoroDefault);
      engine.reset();
      expect(engine.current, isA<TimerIdle>());
      await engine.dispose();
    });

    test('pause() then resume() preserves elapsed across the gap', () async {
      final engine = RealTimerEngine();
      engine.start(SessionConfig.pomodoroDefault);
      await Future<void>.delayed(const Duration(milliseconds: 25));
      engine.pause();
      expect(engine.current, isA<TimerPaused>());
      final pausedElapsed = (engine.current as TimerPaused).elapsed;
      await Future<void>.delayed(const Duration(milliseconds: 25));
      engine.resume();
      expect(engine.current, isA<TimerRunning>());
      // Resume should not retroactively count the paused gap; elapsed is
      // at least the pre-pause value, possibly a tiny bit higher from the
      // resumed Stopwatch starting up but never the +25ms from the gap.
      final resumedElapsed = (engine.current as TimerRunning).elapsed;
      expect(
        resumedElapsed.inMilliseconds,
        greaterThanOrEqualTo(pausedElapsed.inMilliseconds),
      );
      expect(
        resumedElapsed.inMilliseconds,
        lessThan(pausedElapsed.inMilliseconds + 20),
      );
      await engine.dispose();
    });

    test('strict mode throws StateError when pausing focus', () async {
      final engine = RealTimerEngine();
      final config = SessionConfig.pomodoroDefault.copyWith(strictMode: true);
      engine.start(config);
      expect(engine.pause, throwsStateError);
      await engine.dispose();
    });

    test('skip() during focus emits TimerPeriodComplete', () async {
      final engine = RealTimerEngine();
      final states = <TimerState>[];
      final sub = engine.stream.listen(states.add);
      engine.start(SessionConfig.pomodoroDefault);
      await Future<void>.delayed(Duration.zero);
      engine.skip();
      await Future<void>.delayed(Duration.zero);
      expect(
        states.any((s) => s is TimerPeriodComplete),
        isTrue,
        reason: 'Expected TimerPeriodComplete after skip(): $states',
      );
      await sub.cancel();
      await engine.dispose();
    });
  });
}
