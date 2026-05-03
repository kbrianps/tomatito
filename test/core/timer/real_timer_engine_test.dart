// ignore_for_file: cascade_invocations

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/timer/checkpoint_store.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/real_timer_engine.dart';
import 'package:tomatito/core/timer/session_checkpoint.dart';
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

  group('RealTimerEngine checkpointing', () {
    late Directory tempDir;
    late CheckpointStore store;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('engine_cp_test_');
      store = CheckpointStore(File('${tempDir.path}/cp.json'));
    });

    tearDown(() async {
      if (tempDir.existsSync()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('pause() writes a checkpoint to disk', () async {
      final engine = RealTimerEngine(checkpointStore: store);
      engine.start(SessionConfig.pomodoroDefault);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      engine.pause();
      // Checkpoint write is async; let it land.
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final cp = await store.load();
      expect(cp, isNotNull);
      expect(cp!.kind, PeriodKind.focus);
      expect(cp.cycle, 1);
      await engine.dispose();
    });

    test('reset() clears any persisted checkpoint', () async {
      final engine = RealTimerEngine(checkpointStore: store);
      engine.start(SessionConfig.pomodoroDefault);
      await Future<void>.delayed(const Duration(milliseconds: 10));
      engine.pause();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(await store.load(), isNotNull);
      engine.reset();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(await store.load(), isNull);
      await engine.dispose();
    });

    test('restoreFromCheckpointIfFresh restores a paused state', () async {
      final fixture = SessionCheckpoint(
        kind: PeriodKind.focus,
        elapsed: const Duration(minutes: 4),
        total: const Duration(minutes: 25),
        cycle: 2,
        totalCycles: 4,
        focusSessionsCompleted: 1,
        savedAt: DateTime.now(),
      );
      await store.save(fixture);

      final engine = RealTimerEngine(checkpointStore: store);
      final restored = await engine.restoreFromCheckpointIfFresh(
        SessionConfig.pomodoroDefault,
      );

      expect(restored, isTrue);
      expect(engine.current, isA<TimerPaused>());
      final paused = engine.current as TimerPaused;
      expect(paused.kind, PeriodKind.focus);
      expect(paused.cycle, 2);
      expect(paused.elapsed, const Duration(minutes: 4));
      await engine.dispose();
    });

    test('stale checkpoint is cleared and not restored', () async {
      final stale = SessionCheckpoint(
        kind: PeriodKind.focus,
        elapsed: const Duration(minutes: 4),
        total: const Duration(minutes: 25),
        cycle: 1,
        totalCycles: 4,
        focusSessionsCompleted: 0,
        savedAt: DateTime.now().subtract(const Duration(hours: 2)),
      );
      await store.save(stale);

      final engine = RealTimerEngine(checkpointStore: store);
      final restored = await engine.restoreFromCheckpointIfFresh(
        SessionConfig.pomodoroDefault,
      );

      expect(restored, isFalse);
      expect(engine.current, isA<TimerIdle>());
      expect(
        await store.load(),
        isNull,
        reason: 'Stale checkpoint should be cleared.',
      );
      await engine.dispose();
    });
  });
}
