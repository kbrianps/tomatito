// ignore_for_file: cascade_invocations
// Tests stay step-by-step for readability; cascades hurt the narrative.

import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/timer/fake_timer_engine.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_state.dart';

void main() {
  group('FakeTimerEngine', () {
    test('starts in TimerIdle', () {
      final engine = FakeTimerEngine();
      expect(engine.current, isA<TimerIdle>());
    });

    test('start() emits TimerRunning with focus immediately', () async {
      final engine = FakeTimerEngine();
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
      final engine = FakeTimerEngine();
      engine.start(SessionConfig.pomodoroDefault);
      engine.reset();
      expect(engine.current, isA<TimerIdle>());
      await engine.dispose();
    });

    test('pause() then resume() preserves elapsed', () async {
      final engine = FakeTimerEngine();
      engine.start(SessionConfig.pomodoroDefault);
      engine.pause();
      expect(engine.current, isA<TimerPaused>());
      final pausedElapsed = (engine.current as TimerPaused).elapsed;
      engine.resume();
      expect(engine.current, isA<TimerRunning>());
      expect((engine.current as TimerRunning).elapsed, pausedElapsed);
      await engine.dispose();
    });

    test('strict mode throws StateError when pausing focus', () async {
      final engine = FakeTimerEngine();
      final config = SessionConfig.pomodoroDefault.copyWith(strictMode: true);
      engine.start(config);
      expect(engine.pause, throwsStateError);
      await engine.dispose();
    });

    test('skip() during focus emits TimerPeriodComplete', () async {
      final engine = FakeTimerEngine();
      final states = <TimerState>[];
      final sub = engine.stream.listen(states.add);
      engine.start(SessionConfig.pomodoroDefault);
      await Future<void>.delayed(Duration.zero);
      engine.skip();
      await Future<void>.delayed(Duration.zero);
      expect(
        states.any((s) => s is TimerPeriodComplete),
        isTrue,
        reason: 'Expected a TimerPeriodComplete after skip(): $states',
      );
      await sub.cancel();
      await engine.dispose();
    });

    test('skip() in long-break cycle ends in TimerIdle', () async {
      final engine = FakeTimerEngine();
      final config = SessionConfig.pomodoroDefault.copyWith(
        cyclesBeforeLongBreak: 1,
        autoStartBreaks: true,
      );
      engine.start(config);
      // Focus -> auto-starts long break.
      engine.skip();
      await Future<void>.delayed(Duration.zero);
      // Long break -> ends session.
      engine.skip();
      await Future<void>.delayed(Duration.zero);
      expect(engine.current, isA<TimerIdle>());
      await engine.dispose();
    });
  });
}
