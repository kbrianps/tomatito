import 'package:tomatito/core/statistics/stats_summary.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/statistics_repository.dart';

/// Pure-function aggregator that turns a list of completion records into a
/// `StatsSummary`. Streak math obeys the same "today does not break the
/// streak unless not satisfied" rule as `StreakCalculator` so the rich
/// panel agrees with the dial chip on the timer screen.
class StatsAggregator {
  const StatsAggregator({required this.dailyGoalMinutes});

  final int dailyGoalMinutes;

  StatsSummary summarise(List<CompletionRecord> records, {DateTime? now}) {
    final asOf = now ?? DateTime.now();
    final today = DateTime(asOf.year, asOf.month, asOf.day);

    final focusOnly =
        records.where((r) => r.kind == PeriodKind.focus).toList();

    if (focusOnly.isEmpty) {
      return StatsSummary(
        todayMinutes: 0,
        weekMinutes: 0,
        totalMinutes: 0,
        totalSessions: 0,
        currentStreakDays: 0,
        longestStreakDays: 0,
        bestDayMinutes: 0,
        bestDay: null,
        bestHour: null,
        bestHourMinutes: 0,
        activeDays: 0,
        dailyMinutesLast7: _emptyLast7(today),
        dayOfWeekMinutes: const [0, 0, 0, 0, 0, 0, 0],
        hourOfDayMinutes: List<int>.filled(24, 0),
      );
    }

    final perDay = <DateTime, int>{};
    final perDow = List<int>.filled(7, 0);
    final perHour = List<int>.filled(24, 0);
    var totalMinutes = 0;

    for (final r in focusOnly) {
      final mins = r.duration.inMinutes;
      totalMinutes += mins;
      final day = DateTime(r.endedAt.year, r.endedAt.month, r.endedAt.day);
      perDay[day] = (perDay[day] ?? 0) + mins;
      perDow[r.endedAt.weekday - 1] += mins;
      perHour[r.endedAt.hour] += mins;
    }

    final last7 = <DailyMinutes>[];
    var weekMinutes = 0;
    for (var i = 6; i >= 0; i--) {
      final day = DateTime(today.year, today.month, today.day - i);
      final mins = perDay[day] ?? 0;
      last7.add(DailyMinutes(day: day, minutes: mins));
      weekMinutes += mins;
    }

    final todayMinutes = perDay[today] ?? 0;

    DateTime? bestDay;
    var bestDayMinutes = 0;
    perDay.forEach((day, mins) {
      if (mins > bestDayMinutes) {
        bestDayMinutes = mins;
        bestDay = day;
      }
    });

    int? bestHour;
    var bestHourMinutes = 0;
    for (var h = 0; h < 24; h++) {
      if (perHour[h] > bestHourMinutes) {
        bestHourMinutes = perHour[h];
        bestHour = h;
      }
    }

    final currentStreak = _currentStreak(perDay, today);
    final longestStreak = _longestStreak(perDay, today);

    return StatsSummary(
      todayMinutes: todayMinutes,
      weekMinutes: weekMinutes,
      totalMinutes: totalMinutes,
      totalSessions: focusOnly.length,
      currentStreakDays: currentStreak,
      longestStreakDays: longestStreak,
      bestDayMinutes: bestDayMinutes,
      bestDay: bestDay,
      bestHour: bestHour,
      bestHourMinutes: bestHourMinutes,
      activeDays: perDay.length,
      dailyMinutesLast7: last7,
      dayOfWeekMinutes: perDow,
      hourOfDayMinutes: perHour,
    );
  }

  int _currentStreak(Map<DateTime, int> perDay, DateTime today) {
    if (dailyGoalMinutes <= 0) return 0;
    var streak = 0;
    DateTime cursor;
    if ((perDay[today] ?? 0) >= dailyGoalMinutes) {
      streak = 1;
      cursor = _previousDay(today);
    } else {
      cursor = _previousDay(today);
    }
    while ((perDay[cursor] ?? 0) >= dailyGoalMinutes) {
      streak++;
      cursor = _previousDay(cursor);
    }
    return streak;
  }

  int _longestStreak(Map<DateTime, int> perDay, DateTime today) {
    if (dailyGoalMinutes <= 0 || perDay.isEmpty) return 0;
    final days = perDay.keys.toList()..sort();
    final earliest = days.first;
    var longest = 0;
    var run = 0;
    var cursor = earliest;
    while (!cursor.isAfter(today)) {
      if ((perDay[cursor] ?? 0) >= dailyGoalMinutes) {
        run++;
        if (run > longest) longest = run;
      } else {
        run = 0;
      }
      cursor = DateTime(cursor.year, cursor.month, cursor.day + 1);
    }
    return longest;
  }

  static DateTime _previousDay(DateTime d) =>
      DateTime(d.year, d.month, d.day - 1);

  static List<DailyMinutes> _emptyLast7(DateTime today) {
    final out = <DailyMinutes>[];
    for (var i = 6; i >= 0; i--) {
      out.add(
        DailyMinutes(
          day: DateTime(today.year, today.month, today.day - i),
          minutes: 0,
        ),
      );
    }
    return out;
  }
}
