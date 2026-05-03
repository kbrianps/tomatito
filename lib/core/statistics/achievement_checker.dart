import 'package:tomatito/core/statistics/achievement.dart';
import 'package:tomatito/core/statistics/stats_summary.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/statistics_repository.dart';

/// Maps a `StatsSummary` (plus the raw completion list, for badges that
/// depend on per-record predicates like "before 8am") onto an ordered list
/// of `AchievementProgress` entries.
class AchievementChecker {
  const AchievementChecker();

  List<AchievementProgress> evaluate({
    required StatsSummary summary,
    required List<CompletionRecord> records,
  }) {
    final earlyBirdCount = records
        .where((r) => r.kind == PeriodKind.focus && r.endedAt.hour < 9)
        .length;
    final nightOwlCount = records
        .where((r) => r.kind == PeriodKind.focus && r.endedAt.hour >= 21)
        .length;
    final weekendCount = records
        .where(
          (r) =>
              r.kind == PeriodKind.focus &&
              (r.endedAt.weekday == DateTime.saturday ||
                  r.endedAt.weekday == DateTime.sunday),
        )
        .length;

    return AchievementRegistry.all
        .map((a) => _progressFor(a, summary, earlyBirdCount, nightOwlCount,
            weekendCount))
        .toList();
  }

  AchievementProgress _progressFor(
    Achievement a,
    StatsSummary s,
    int earlyBirdCount,
    int nightOwlCount,
    int weekendCount,
  ) {
    final raw = switch (a.id) {
      AchievementId.firstSession => s.totalSessions,
      AchievementId.tenSessions => s.totalSessions,
      AchievementId.fiftySessions => s.totalSessions,
      AchievementId.hundredSessions => s.totalSessions,
      AchievementId.fiveHundredSessions => s.totalSessions,
      AchievementId.oneHourTotal => s.totalMinutes,
      AchievementId.tenHoursTotal => s.totalMinutes,
      AchievementId.fiftyHoursTotal => s.totalMinutes,
      AchievementId.hundredHoursTotal => s.totalMinutes,
      AchievementId.streakThree => s.longestStreakDays,
      AchievementId.streakSeven => s.longestStreakDays,
      AchievementId.streakThirty => s.longestStreakDays,
      AchievementId.earlyBird => earlyBirdCount,
      AchievementId.nightOwl => nightOwlCount,
      AchievementId.weekendWarrior => weekendCount,
      AchievementId.marathonDay => s.bestDayMinutes,
    };
    final clamped = raw > a.target ? a.target : raw;
    return AchievementProgress(
      achievement: a,
      progress: clamped,
      unlocked: raw >= a.target,
    );
  }
}
