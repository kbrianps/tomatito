import 'package:tomatito/data/statistics_repository.dart';

/// Computes the current daily-focus streak from per-day totals.
///
/// Rules (per spec):
///   * Today does not break the streak if the goal is not yet hit.
///   * A day with `minutes >= dailyGoalMinutes` is "satisfied".
///   * Walk back from today; the streak ends at the first unsatisfied past
///     day. Today itself counts only when satisfied.
///   * Day arithmetic uses the DateTime constructor (which normalises across
///     month and DST boundaries) rather than Duration subtraction, which
///     would jitter by an hour at DST transitions.
class StreakCalculator {
  const StreakCalculator({required this.dailyGoalMinutes});

  final int dailyGoalMinutes;

  int currentStreak(List<DailyMinutes> dailyTotals, {DateTime? now}) {
    if (dailyGoalMinutes <= 0) return 0;
    final asOf = now ?? DateTime.now();
    final today = DateTime(asOf.year, asOf.month, asOf.day);

    final byDay = <DateTime, int>{};
    for (final d in dailyTotals) {
      final key = DateTime(d.day.year, d.day.month, d.day.day);
      byDay[key] = (byDay[key] ?? 0) + d.minutes;
    }

    var streak = 0;
    DateTime cursor;
    if ((byDay[today] ?? 0) >= dailyGoalMinutes) {
      streak = 1;
      cursor = _previousDay(today);
    } else {
      cursor = _previousDay(today);
    }

    while ((byDay[cursor] ?? 0) >= dailyGoalMinutes) {
      streak++;
      cursor = _previousDay(cursor);
    }
    return streak;
  }

  static DateTime _previousDay(DateTime d) =>
      DateTime(d.year, d.month, d.day - 1);
}
