// ignore_for_file: avoid_redundant_argument_values
// Test dates intentionally use day=1 for readability of fixtures.

import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/statistics/streak_calculator.dart';
import 'package:tomatito/data/statistics_repository.dart';

void main() {
  const calc = StreakCalculator(dailyGoalMinutes: 60);

  DailyMinutes day(DateTime d, int minutes) =>
      DailyMinutes(day: DateTime(d.year, d.month, d.day), minutes: minutes);

  group('StreakCalculator', () {
    test('empty input gives zero streak', () {
      expect(calc.currentStreak([], now: DateTime(2026, 5, 2)), 0);
    });

    test('today only and goal hit gives streak 1', () {
      final now = DateTime(2026, 5, 2, 12);
      expect(calc.currentStreak([day(now, 90)], now: now), 1);
    });

    test('today only and goal missed gives streak 0', () {
      final now = DateTime(2026, 5, 2, 12);
      expect(calc.currentStreak([day(now, 30)], now: now), 0);
    });

    test('today missed but yesterday hit still gives streak 1', () {
      final now = DateTime(2026, 5, 2, 9);
      final yesterday = DateTime(2026, 5, 1);
      expect(
        calc.currentStreak([day(yesterday, 90), day(now, 0)], now: now),
        1,
        reason: 'Today does not break the streak when not yet satisfied.',
      );
    });

    test('three-day chain ending today is streak 3', () {
      final now = DateTime(2026, 5, 2, 12);
      final totals = [
        day(DateTime(2026, 4, 30), 60),
        day(DateTime(2026, 5, 1), 90),
        day(now, 70),
      ];
      expect(calc.currentStreak(totals, now: now), 3);
    });

    test('gap in middle stops streak at the gap', () {
      final now = DateTime(2026, 5, 2, 12);
      final totals = [
        day(DateTime(2026, 4, 28), 90),
        day(DateTime(2026, 4, 29), 90),
        // 2026-04-30 missing -> 0 minutes
        day(DateTime(2026, 5, 1), 90),
        day(now, 90),
      ];
      expect(
        calc.currentStreak(totals, now: now),
        2,
        reason: 'Today + yesterday count; the gap on 04-30 stops the chain.',
      );
    });

    test('zero or negative goal returns zero', () {
      const c = StreakCalculator(dailyGoalMinutes: 0);
      final now = DateTime(2026, 5, 2);
      expect(c.currentStreak([day(now, 90)], now: now), 0);
    });

    test('day arithmetic crosses month boundary correctly', () {
      final now = DateTime(2026, 5, 2, 12);
      final totals = [
        day(DateTime(2026, 4, 30), 90),
        day(DateTime(2026, 5, 1), 90),
        day(now, 90),
      ];
      expect(
        calc.currentStreak(totals, now: now),
        3,
        reason: 'Walking back from 2026-05-02 must reach 2026-04-30.',
      );
    });

    test('day arithmetic survives a DST fall-back (US: 2024-11-03)', () {
      // The US "fall back" makes 2024-11-03 have 25 hours.
      // Subtracting Duration(days: 1) would land at the wrong wall-clock
      // hour; the calculator uses DateTime(y, m, day - 1) instead, which
      // normalises to the correct local date.
      final now = DateTime(2024, 11, 4, 9);
      final totals = [
        day(DateTime(2024, 11, 2), 90),
        day(DateTime(2024, 11, 3), 90),
        day(now, 90),
      ];
      expect(calc.currentStreak(totals, now: now), 3);
    });

    test('multiple records on the same day are summed', () {
      final now = DateTime(2026, 5, 2, 18);
      final totals = [
        DailyMinutes(day: DateTime(2026, 5, 2), minutes: 30),
        DailyMinutes(day: DateTime(2026, 5, 2), minutes: 35),
      ];
      expect(
        calc.currentStreak(totals, now: now),
        1,
        reason: '30 + 35 = 65 minutes >= goal 60; today counts.',
      );
    });
  });
}
