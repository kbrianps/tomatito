import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/statistics_repository.dart';

/// Local-only stats store backed by a line-delimited JSON file. Each
/// completion record is one line: `{"kind":"focus","durationMs":...,...}`.
/// Append-on-write keeps the cost per record small; a corrupt line is
/// silently skipped so a partial write never breaks the read path.
///
/// Drift migration is deferred to Phase 2.x when query patterns warrant it.
class JsonStatisticsRepository implements StatisticsRepository {
  JsonStatisticsRepository(this._file);

  final File _file;
  final StreamController<void> _changes = StreamController<void>.broadcast();

  static Future<JsonStatisticsRepository> create() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'tomatito_stats.jsonl'));
    return JsonStatisticsRepository(file);
  }

  @override
  Stream<void> get changes => _changes.stream;

  @override
  Future<void> recordCompletion({
    required PeriodKind kind,
    required Duration duration,
    required DateTime endedAtLocal,
  }) async {
    final line = jsonEncode(<String, dynamic>{
      'kind': kind.name,
      'durationMs': duration.inMilliseconds,
      'endedAtIso': endedAtLocal.toIso8601String(),
    });
    await _file.parent.create(recursive: true);
    await _file.writeAsString('$line\n', mode: FileMode.append, flush: true);
    _changes.add(null);
  }

  @override
  Future<int> minutesFocusedOn(DateTime localDay) async {
    final all = await loadAllCompletions();
    final dayStart = DateTime(localDay.year, localDay.month, localDay.day);
    final dayEnd = dayStart.add(const Duration(days: 1));
    return all
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
    final all = await loadAllCompletions();
    final result = <DailyMinutes>[];
    var day = DateTime(fromLocalDay.year, fromLocalDay.month, fromLocalDay.day);
    final end = DateTime(toLocalDay.year, toLocalDay.month, toLocalDay.day);
    while (!day.isAfter(end)) {
      final next = day.add(const Duration(days: 1));
      final minutes = all
          .where(
            (c) =>
                c.kind == PeriodKind.focus &&
                !c.endedAt.isBefore(day) &&
                c.endedAt.isBefore(next),
          )
          .fold<int>(0, (sum, c) => sum + c.duration.inMinutes);
      result.add(DailyMinutes(day: day, minutes: minutes));
      day = next;
    }
    return result;
  }

  @override
  Future<List<CompletionRecord>> loadAllCompletions() async {
    if (!_file.existsSync()) return const [];
    final lines = await _file.readAsLines();
    final out = <CompletionRecord>[];
    for (final line in lines) {
      if (line.trim().isEmpty) continue;
      try {
        final json = jsonDecode(line) as Map<String, dynamic>;
        out.add(
          CompletionRecord(
            kind: PeriodKind.values.firstWhere(
              (k) => k.name == json['kind'],
              orElse: () => PeriodKind.focus,
            ),
            duration: Duration(milliseconds: json['durationMs'] as int),
            endedAt: DateTime.parse(json['endedAtIso'] as String),
          ),
        );
      } on Object {
        // Skip a corrupt line so a partial write never breaks the read path.
        continue;
      }
    }
    return out;
  }

  Future<void> close() => _changes.close();
}
