import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/statistics_repository.dart';

/// Web-friendly stats store backed by `SharedPreferences` (which is
/// `localStorage` under the hood on web). Stores every completion as a
/// JSON-encoded list under a single key. Survives page refresh; gets
/// cleared if the user wipes browser data.
///
/// Used on web because `path_provider` has no implementation there, so
/// the JSONL-on-disk `JsonStatisticsRepository` cannot init. On other
/// platforms `JsonStatisticsRepository` is the production choice (faster
/// append-only writes, no full-list serialisation per save).
class SharedPrefsStatisticsRepository implements StatisticsRepository {
  SharedPrefsStatisticsRepository(this._prefs);

  final SharedPreferences _prefs;
  final StreamController<void> _changes = StreamController<void>.broadcast();

  static const String _key = 'tomatito.completions.v1';

  static Future<SharedPrefsStatisticsRepository> create() async {
    final prefs = await SharedPreferences.getInstance();
    return SharedPrefsStatisticsRepository(prefs);
  }

  @override
  Stream<void> get changes => _changes.stream;

  @override
  Future<void> recordCompletion({
    required PeriodKind kind,
    required Duration duration,
    required DateTime endedAtLocal,
  }) async {
    final list = _readRaw()
      ..add(<String, dynamic>{
        'kind': kind.name,
        'durationMs': duration.inMilliseconds,
        'endedAtIso': endedAtLocal.toIso8601String(),
      });
    await _prefs.setString(_key, jsonEncode(list));
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
    final raw = _readRaw();
    final out = <CompletionRecord>[];
    for (final item in raw) {
      try {
        out.add(
          CompletionRecord(
            kind: PeriodKind.values.firstWhere(
              (k) => k.name == item['kind'],
              orElse: () => PeriodKind.focus,
            ),
            duration: Duration(milliseconds: item['durationMs'] as int),
            endedAt: DateTime.parse(item['endedAtIso'] as String),
          ),
        );
      } on Object {
        continue;
      }
    }
    return out;
  }

  List<Map<String, dynamic>> _readRaw() {
    final raw = _prefs.getString(_key);
    if (raw == null || raw.isEmpty) return <Map<String, dynamic>>[];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return <Map<String, dynamic>>[];
      return decoded.cast<Map<String, dynamic>>();
    } on Object {
      return <Map<String, dynamic>>[];
    }
  }

  Future<void> close() => _changes.close();
}
