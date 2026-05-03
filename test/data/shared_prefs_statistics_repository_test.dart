import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/shared_prefs_statistics_repository.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('returns the empty list when no completions have been written',
      () async {
    final repo = await SharedPrefsStatisticsRepository.create();
    expect(await repo.loadAllCompletions(), isEmpty);
    expect(await repo.minutesFocusedOn(DateTime.now()), 0);
  });

  test('records a completion and reads it back', () async {
    final repo = await SharedPrefsStatisticsRepository.create();
    final at = DateTime(2026, 5, 3, 14, 30);
    await repo.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 25),
      endedAtLocal: at,
    );
    final all = await repo.loadAllCompletions();
    expect(all, hasLength(1));
    expect(all.first.kind, PeriodKind.focus);
    expect(all.first.duration, const Duration(minutes: 25));
    expect(all.first.endedAt, at);
  });

  test('survives a fresh repository instance backed by the same prefs',
      () async {
    final first = await SharedPrefsStatisticsRepository.create();
    await first.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 25),
      endedAtLocal: DateTime(2026, 5, 3, 14),
    );
    // A second instance is the equivalent of reopening the app on web:
    // shared_preferences shares state across instances, so the record
    // must still be there.
    final second = await SharedPrefsStatisticsRepository.create();
    expect(await second.loadAllCompletions(), hasLength(1));
  });

  test('minutesFocusedOn sums multiple records on the same day', () async {
    final repo = await SharedPrefsStatisticsRepository.create();
    final day = DateTime(2026, 5, 3, 9);
    for (var i = 0; i < 3; i++) {
      await repo.recordCompletion(
        kind: PeriodKind.focus,
        duration: const Duration(minutes: 25),
        endedAtLocal: day.add(Duration(hours: i)),
      );
    }
    expect(await repo.minutesFocusedOn(day), 75);
  });

  test('minutesFocusedOn ignores non-focus completions', () async {
    final repo = await SharedPrefsStatisticsRepository.create();
    final day = DateTime(2026, 5, 3, 9);
    await repo.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 25),
      endedAtLocal: day,
    );
    await repo.recordCompletion(
      kind: PeriodKind.shortBreak,
      duration: const Duration(minutes: 5),
      endedAtLocal: day,
    );
    expect(await repo.minutesFocusedOn(day), 25);
  });

  test('minutesFocusedInRange returns one entry per day', () async {
    final repo = await SharedPrefsStatisticsRepository.create();
    final day0 = DateTime(2026, 5, 1, 14);
    await repo.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 25),
      endedAtLocal: day0,
    );
    await repo.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 50),
      endedAtLocal: day0.add(const Duration(days: 2)),
    );
    final range = await repo.minutesFocusedInRange(
      fromLocalDay: day0,
      toLocalDay: day0.add(const Duration(days: 2)),
    );
    expect(range, hasLength(3));
    expect(range[0].minutes, 25);
    expect(range[1].minutes, 0);
    expect(range[2].minutes, 50);
  });

  test('changes stream emits when a record is written', () async {
    final repo = await SharedPrefsStatisticsRepository.create();
    final emitted = <void>[];
    final sub = repo.changes.listen(emitted.add);
    await repo.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 25),
      endedAtLocal: DateTime(2026, 5, 3, 14),
    );
    await Future<void>.delayed(Duration.zero);
    expect(emitted, hasLength(1));
    await sub.cancel();
  });
}
