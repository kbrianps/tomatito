import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tomatito/core/timer/period_kind.dart';

/// Local-only history of completed periods. No telemetry, no accounts, no
/// cloud sync. Phase 2 ships a Drift-backed implementation.
abstract class StatisticsRepository {
  Future<void> recordCompletion({
    required PeriodKind kind,
    required Duration duration,
    required DateTime endedAtLocal,
  });

  Future<int> minutesFocusedOn(DateTime localDay);

  Future<List<DailyMinutes>> minutesFocusedInRange({
    required DateTime fromLocalDay,
    required DateTime toLocalDay,
  });

  Stream<void> get changes;
}

class DailyMinutes {
  const DailyMinutes({required this.day, required this.minutes});
  final DateTime day;
  final int minutes;
}

final statisticsRepositoryProvider = Provider<StatisticsRepository>((ref) {
  throw UnimplementedError(
    'statisticsRepositoryProvider has no binding. Override it in main().',
  );
});
