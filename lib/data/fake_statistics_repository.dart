import 'dart:async';
import 'dart:math' as math;

import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/statistics_repository.dart';

/// In-memory stats store for Phase 1. Optionally seeds a few weeks of sample
/// data so the StatisticsScreen panel has charts, distributions, and
/// achievements visible during UI work.
class FakeStatisticsRepository implements StatisticsRepository {
  FakeStatisticsRepository({bool seedSampleData = true}) {
    if (seedSampleData) _seed();
  }

  final List<CompletionRecord> _completions = [];
  final StreamController<void> _changes = StreamController<void>.broadcast();

  @override
  Stream<void> get changes => _changes.stream;

  @override
  Future<void> recordCompletion({
    required PeriodKind kind,
    required Duration duration,
    required DateTime endedAtLocal,
  }) async {
    _completions.add(
      CompletionRecord(
        kind: kind,
        duration: duration,
        endedAt: endedAtLocal,
      ),
    );
    _changes.add(null);
  }

  @override
  Future<int> minutesFocusedOn(DateTime localDay) async {
    final dayStart = DateTime(localDay.year, localDay.month, localDay.day);
    final dayEnd = dayStart.add(const Duration(days: 1));
    return _completions
        .where(
          (c) =>
              c.kind == PeriodKind.focus &&
              !c.endedAt.isBefore(dayStart) &&
              c.endedAt.isBefore(dayEnd),
        )
        .fold<int>(0, (sum, c) => sum + c.duration.inMinutes);
  }

  @override
  Future<List<DailyMinutes>> minutesFocusedInRange({
    required DateTime fromLocalDay,
    required DateTime toLocalDay,
  }) async {
    final result = <DailyMinutes>[];
    var day = DateTime(fromLocalDay.year, fromLocalDay.month, fromLocalDay.day);
    final end = DateTime(toLocalDay.year, toLocalDay.month, toLocalDay.day);
    while (!day.isAfter(end)) {
      result.add(DailyMinutes(day: day, minutes: await minutesFocusedOn(day)));
      day = day.add(const Duration(days: 1));
    }
    return result;
  }

  @override
  Future<List<CompletionRecord>> loadAllCompletions() async =>
      List.unmodifiable(_completions);

  void _seed() {
    final now = DateTime.now();
    final rng = math.Random(42);
    // Spread sample focus sessions across the last 28 days so the heatmap
    // and day-of-week charts have texture.
    for (var dayOffset = 27; dayOffset >= 0; dayOffset--) {
      final base = now.subtract(Duration(days: dayOffset));
      final day = DateTime(base.year, base.month, base.day);
      final sessions = rng.nextInt(5);
      for (var s = 0; s < sessions; s++) {
        final hour = 8 + rng.nextInt(13);
        final minute = rng.nextInt(60);
        _completions.add(
          CompletionRecord(
            kind: PeriodKind.focus,
            duration: const Duration(minutes: 25),
            endedAt: DateTime(day.year, day.month, day.day, hour, minute),
          ),
        );
      }
    }
  }

  Future<void> close() => _changes.close();
}
