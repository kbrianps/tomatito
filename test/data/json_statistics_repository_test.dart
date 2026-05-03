import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/json_statistics_repository.dart';

void main() {
  late Directory tempDir;
  late File statsFile;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('tomatito_stats_test_');
    statsFile = File('${tempDir.path}/stats.jsonl');
  });

  tearDown(() async {
    if (tempDir.existsSync()) {
      await tempDir.delete(recursive: true);
    }
  });

  test('empty repository reports zero minutes for any day', () async {
    final repo = JsonStatisticsRepository(statsFile);
    final today = DateTime(2026, 5, 2);
    expect(await repo.minutesFocusedOn(today), 0);
  });

  test('recorded focus completion appears in minutesFocusedOn', () async {
    final repo = JsonStatisticsRepository(statsFile);
    final today = DateTime(2026, 5, 2);
    await repo.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 25),
      endedAtLocal: DateTime(2026, 5, 2, 14, 30),
    );
    expect(await repo.minutesFocusedOn(today), 25);
  });

  test('break completions are excluded from focus minutes', () async {
    final repo = JsonStatisticsRepository(statsFile);
    final today = DateTime(2026, 5, 2);
    await repo.recordCompletion(
      kind: PeriodKind.shortBreak,
      duration: const Duration(minutes: 5),
      endedAtLocal: DateTime(2026, 5, 2, 14, 35),
    );
    expect(await repo.minutesFocusedOn(today), 0);
  });

  test('range query returns one DailyMinutes per day in the range', () async {
    final repo = JsonStatisticsRepository(statsFile);
    await repo.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 25),
      endedAtLocal: DateTime(2026, 5, 1, 10),
    );
    await repo.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 50),
      endedAtLocal: DateTime(2026, 5, 2, 10),
    );
    final range = await repo.minutesFocusedInRange(
      fromLocalDay: DateTime(2026, 4, 30),
      toLocalDay: DateTime(2026, 5, 2),
    );
    expect(range.length, 3);
    expect(range[0].minutes, 0);
    expect(range[1].minutes, 25);
    expect(range[2].minutes, 50);
  });

  test('a corrupt line is silently skipped', () async {
    const json1 =
        '{"kind":"focus","durationMs":1500000,'
        '"endedAtIso":"2026-05-02T14:30:00"}';
    const json2 =
        '{"kind":"focus","durationMs":3000000,'
        '"endedAtIso":"2026-05-02T15:30:00"}';
    await statsFile.writeAsString('$json1\nthis is not json\n$json2\n');
    final repo = JsonStatisticsRepository(statsFile);
    expect(await repo.minutesFocusedOn(DateTime(2026, 5, 2)), 75);
  });
}
