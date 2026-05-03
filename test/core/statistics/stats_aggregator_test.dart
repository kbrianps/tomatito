import 'package:flutter_test/flutter_test.dart';

import 'package:tomatito/core/statistics/stats_aggregator.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/statistics_repository.dart';

void main() {
  group('StatsAggregator', () {
    const aggregator = StatsAggregator(dailyGoalMinutes: 60);
    final fixedNow = DateTime(2026, 5, 2, 14);
    DateTime day(int offset, {int hour = 14}) =>
        DateTime(2026, 5, 2 - offset, hour);

    test('returns the empty summary when no completions exist', () {
      final s = aggregator.summarise(const [], now: fixedNow);
      expect(s.hasAnyData, isFalse);
      expect(s.totalSessions, 0);
      expect(s.totalMinutes, 0);
      expect(s.dayOfWeekMinutes, hasLength(7));
      expect(s.hourOfDayMinutes, hasLength(24));
      expect(s.dailyMinutesLast7, hasLength(7));
      expect(s.bestDay, isNull);
      expect(s.bestHour, isNull);
    });

    test('ignores break completions for focus minutes and sessions', () {
      final s = aggregator.summarise([
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: day(0),
        ),
        CompletionRecord(
          kind: PeriodKind.shortBreak,
          duration: const Duration(minutes: 5),
          endedAt: day(0),
        ),
      ], now: fixedNow);
      expect(s.totalSessions, 1);
      expect(s.totalMinutes, 25);
      expect(s.todayMinutes, 25);
    });

    test('builds dayOfWeek and hourOfDay distributions', () {
      // 2026-05-02 is a Saturday (weekday 6); 2026-05-01 is Friday (5).
      final s = aggregator.summarise([
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 30),
          endedAt: DateTime(2026, 5, 2, 9, 30),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 45),
          endedAt: DateTime(2026, 5, 1, 9, 15),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: DateTime(2026, 4, 30, 22, 5),
        ),
      ], now: fixedNow);
      expect(s.dayOfWeekMinutes[5], 30); // Saturday
      expect(s.dayOfWeekMinutes[4], 45); // Friday
      expect(s.dayOfWeekMinutes[3], 25); // Thursday
      expect(s.hourOfDayMinutes[9], 75); // 30 + 45
      expect(s.hourOfDayMinutes[22], 25);
    });

    test('best day picks the day with the most focus minutes', () {
      final s = aggregator.summarise([
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: day(0),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: day(0),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: day(0),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: day(1),
        ),
      ], now: fixedNow);
      expect(s.bestDayMinutes, 75);
      expect(s.bestDay, DateTime(2026, 5, 2));
    });

    test('rolling 7-day window contains today plus the prior 6', () {
      final s = aggregator.summarise([
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 30),
          endedAt: day(0),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 30),
          endedAt: day(8),
        ),
      ], now: fixedNow);
      expect(s.dailyMinutesLast7, hasLength(7));
      expect(s.dailyMinutesLast7.last.day, DateTime(2026, 5, 2));
      expect(s.dailyMinutesLast7.first.day, DateTime(2026, 4, 26));
      expect(s.weekMinutes, 30);
    });

    test('current streak counts back from today only when today is satisfied',
        () {
      // Goal 60. Today has 60+, yesterday 60+, day before 30 (breaks).
      final s = aggregator.summarise([
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 60),
          endedAt: day(0),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 60),
          endedAt: day(1),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 30),
          endedAt: day(2),
        ),
      ], now: fixedNow);
      expect(s.currentStreakDays, 2);
    });

    test('current streak unaffected when today is short', () {
      // Goal 60. Yesterday and day-before satisfied; today only 30.
      final s = aggregator.summarise([
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 30),
          endedAt: day(0),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 60),
          endedAt: day(1),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 60),
          endedAt: day(2),
        ),
      ], now: fixedNow);
      expect(s.currentStreakDays, 2);
    });

    test('longest streak finds the longest historical run', () {
      final s = aggregator.summarise([
        // Long-ago run of 3 satisfied days then a gap.
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 60),
          endedAt: day(20),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 60),
          endedAt: day(19),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 60),
          endedAt: day(18),
        ),
        // Recent run of 2 satisfied days.
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 60),
          endedAt: day(1),
        ),
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 60),
          endedAt: day(0),
        ),
      ], now: fixedNow);
      expect(s.longestStreakDays, 3);
    });
  });
}
