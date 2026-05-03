import 'dart:async';

import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/statistics_repository.dart';

/// In-memory stats store for Phase 1. Optionally seeds a week of sample data
/// so the StatisticsScreen has something visible during UI work.
class FakeStatisticsRepository implements StatisticsRepository {
  FakeStatisticsRepository({bool seedSampleData = true}) {
    if (seedSampleData) _seed();
  }

  final List<_Completion> _completions = [];
  final StreamController<void> _changes = StreamController<void>.broadcast();

  @override
  Stream<void> get changes => _changes.stream;

  @override
  Future<void> recordCompletion({
    required PeriodKind kind,
    required Duration duration,
    required DateTime endedAtLocal,
  }) async {
    _completions.add(_Completion(kind, duration, endedAtLocal));
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

  void _seed() {
    final now = DateTime.now();
    const minutesPerDay = [60, 90, 75, 120, 45, 100, 80];
    for (var i = 0; i < 7; i++) {
      final day = now.subtract(Duration(days: 6 - i));
      _completions.add(
        _Completion(
          PeriodKind.focus,
          Duration(minutes: minutesPerDay[i]),
          DateTime(day.year, day.month, day.day, 14, 30),
        ),
      );
    }
  }

  Future<void> close() => _changes.close();
}

class _Completion {
  const _Completion(this.kind, this.duration, this.endedAt);
  final PeriodKind kind;
  final Duration duration;
  final DateTime endedAt;
}
