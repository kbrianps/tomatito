import 'package:flutter_test/flutter_test.dart';

import 'package:tomatito/core/statistics/achievement.dart';
import 'package:tomatito/core/statistics/achievement_checker.dart';
import 'package:tomatito/core/statistics/stats_aggregator.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/statistics_repository.dart';

void main() {
  group('AchievementChecker', () {
    const checker = AchievementChecker();
    final fixedNow = DateTime(2026, 5, 2, 14);

    AchievementProgress findById(
      List<AchievementProgress> all,
      AchievementId id,
    ) =>
        all.firstWhere((a) => a.achievement.id == id);

    test('all locked when there are no completions', () {
      final summary = const StatsAggregator(dailyGoalMinutes: 60)
          .summarise(const [], now: fixedNow);
      final result = checker.evaluate(summary: summary, records: const []);
      expect(result, hasLength(AchievementRegistry.all.length));
      expect(result.every((a) => !a.unlocked), isTrue);
    });

    test('first session unlocks after one focus completion', () {
      final records = [
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: fixedNow,
        ),
      ];
      final summary = const StatsAggregator(dailyGoalMinutes: 60)
          .summarise(records, now: fixedNow);
      final result = checker.evaluate(summary: summary, records: records);
      final first = findById(result, AchievementId.firstSession);
      expect(first.unlocked, isTrue);
    });

    test('marathon day requires 240 minutes in a single day', () {
      final records = List.generate(
        9,
        (_) => CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: fixedNow,
        ),
      );
      final summary = const StatsAggregator(dailyGoalMinutes: 60)
          .summarise(records, now: fixedNow);
      final result = checker.evaluate(summary: summary, records: records);
      // 9 * 25 = 225 minutes; not enough for marathon day yet.
      expect(findById(result, AchievementId.marathonDay).unlocked, isFalse);
      expect(findById(result, AchievementId.marathonDay).progress, 225);

      // Add one more 25-min session: 250 minutes, marathon unlocked.
      final more = [
        ...records,
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: fixedNow,
        ),
      ];
      final s2 = const StatsAggregator(dailyGoalMinutes: 60)
          .summarise(more, now: fixedNow);
      final r2 = checker.evaluate(summary: s2, records: more);
      expect(findById(r2, AchievementId.marathonDay).unlocked, isTrue);
    });

    test('early bird requires five focus sessions before 9 AM', () {
      final records = List.generate(
        5,
        (i) => CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: DateTime(2026, 5, 2 - i, 7, 30),
        ),
      );
      final summary = const StatsAggregator(dailyGoalMinutes: 60)
          .summarise(records, now: fixedNow);
      final result = checker.evaluate(summary: summary, records: records);
      expect(findById(result, AchievementId.earlyBird).unlocked, isTrue);
      expect(findById(result, AchievementId.nightOwl).unlocked, isFalse);
    });

    test('night owl requires five focus sessions at or after 9 PM', () {
      final records = List.generate(
        5,
        (i) => CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: DateTime(2026, 5, 2 - i, 22, 30),
        ),
      );
      final summary = const StatsAggregator(dailyGoalMinutes: 60)
          .summarise(records, now: fixedNow);
      final result = checker.evaluate(summary: summary, records: records);
      expect(findById(result, AchievementId.nightOwl).unlocked, isTrue);
    });

    test('weekend warrior counts only Saturday and Sunday completions', () {
      // 2026-05-02 is Saturday, 2026-05-03 is Sunday.
      final records = [
        for (var i = 0; i < 6; i++)
          CompletionRecord(
            kind: PeriodKind.focus,
            duration: const Duration(minutes: 25),
            endedAt: DateTime(2026, 5, 2, 10, i),
          ),
        for (var i = 0; i < 6; i++)
          CompletionRecord(
            kind: PeriodKind.focus,
            duration: const Duration(minutes: 25),
            endedAt: DateTime(2026, 5, 3, 10, i),
          ),
        // Add a weekday session to confirm it doesn't count.
        CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: DateTime(2026, 5, 4, 10),
        ),
      ];
      final summary = const StatsAggregator(dailyGoalMinutes: 60)
          .summarise(records, now: DateTime(2026, 5, 4));
      final result = checker.evaluate(summary: summary, records: records);
      final ww = findById(result, AchievementId.weekendWarrior);
      expect(ww.progress, 10);
      expect(ww.unlocked, isTrue);
    });

    test('progress is clamped to target so the bar caps at 100%', () {
      final records = List.generate(
        20,
        (i) => CompletionRecord(
          kind: PeriodKind.focus,
          duration: const Duration(minutes: 25),
          endedAt: DateTime(2026, 5, 2 - i, 14),
        ),
      );
      final summary = const StatsAggregator(dailyGoalMinutes: 60)
          .summarise(records, now: fixedNow);
      final result = checker.evaluate(summary: summary, records: records);
      final tenSessions = findById(result, AchievementId.tenSessions);
      expect(tenSessions.progress, 10);
      expect(tenSessions.fraction, 1.0);
    });
  });
}
