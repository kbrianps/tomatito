/// Pure-function helpers for the daily-streak rules from the spec.
///
/// All maths here MUST be tested for timezone changes, DST and midnight
/// boundaries before the real implementation lands. Phase 0 ships only the
/// type contract; the body intentionally throws so untested code never runs
/// accidentally.
final class StreakCalculator {
  const StreakCalculator({required this.dailyGoalMinutes});

  final int dailyGoalMinutes;

  /// Returns the streak in days, given a list of completed-focus-period end
  /// timestamps in *local* time. Implementation lands in Phase 2.
  int currentStreak(Iterable<DateTime> completionsLocal, {DateTime? now}) {
    throw UnimplementedError(
      'StreakCalculator.currentStreak lands in Phase 2 alongside '
      'StatisticsRepository.',
    );
  }
}
