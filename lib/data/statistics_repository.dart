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

  /// Returns every recorded completion (focus + breaks). The rich stats
  /// panel needs the raw stream so it can group by day-of-week, hour, etc.
  Future<List<CompletionRecord>> loadAllCompletions();

  Stream<void> get changes;
}

class DailyMinutes {
  const DailyMinutes({required this.day, required this.minutes});
  final DateTime day;
  final int minutes;
}

class CompletionRecord {
  const CompletionRecord({
    required this.kind,
    required this.duration,
    required this.endedAt,
  });

  final PeriodKind kind;
  final Duration duration;
  final DateTime endedAt;
}

final statisticsRepositoryProvider = Provider<StatisticsRepository>((ref) {
  throw UnimplementedError(
    'statisticsRepositoryProvider has no binding. Override it in main().',
  );
});
