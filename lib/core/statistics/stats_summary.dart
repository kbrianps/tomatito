import 'package:tomatito/data/statistics_repository.dart';

/// Snapshot of every metric the rich stats panel renders. Computed by
/// `StatsAggregator` from the raw completion stream so the screen can stay
/// declarative.
class StatsSummary {
  const StatsSummary({
    required this.todayMinutes,
    required this.weekMinutes,
    required this.totalMinutes,
    required this.totalSessions,
    required this.currentStreakDays,
    required this.longestStreakDays,
    required this.bestDayMinutes,
    required this.bestDay,
    required this.bestHour,
    required this.bestHourMinutes,
    required this.activeDays,
    required this.dailyMinutesLast7,
    required this.dayOfWeekMinutes,
    required this.hourOfDayMinutes,
  });

  /// Minutes focused today (local).
  final int todayMinutes;

  /// Minutes focused over the rolling last 7 days (today inclusive).
  final int weekMinutes;

  /// Lifetime focus minutes.
  final int totalMinutes;

  /// Lifetime count of focus completions.
  final int totalSessions;

  /// Current daily-goal streak as of today.
  final int currentStreakDays;

  /// Longest daily-goal streak ever achieved (today inclusive).
  final int longestStreakDays;

  /// Minutes on the most-focused single day in history (0 if no data).
  final int bestDayMinutes;

  /// The day on which `bestDayMinutes` was logged (null if no data).
  final DateTime? bestDay;

  /// Hour of day (0-23) with the most lifetime focus minutes (null if none).
  final int? bestHour;

  /// Minutes accumulated in `bestHour` (0 if no data).
  final int bestHourMinutes;

  /// Number of distinct local days with at least one focus completion.
  final int activeDays;

  /// Minutes per day for the last 7 days, oldest first, today last.
  final List<DailyMinutes> dailyMinutesLast7;

  /// Minutes by ISO day-of-week (1 = Monday … 7 = Sunday). Always 7 entries.
  final List<int> dayOfWeekMinutes;

  /// Minutes by hour of day (0-23). Always 24 entries.
  final List<int> hourOfDayMinutes;

  static const StatsSummary empty = StatsSummary(
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
    dailyMinutesLast7: [],
    dayOfWeekMinutes: [0, 0, 0, 0, 0, 0, 0],
    hourOfDayMinutes: [
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
  );

  bool get hasAnyData => totalSessions > 0;
}
