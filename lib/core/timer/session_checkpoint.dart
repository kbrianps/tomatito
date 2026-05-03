import 'package:meta/meta.dart' show immutable;

import 'package:tomatito/core/timer/period_kind.dart';

/// Snapshot of an active session, written periodically by `RealTimerEngine`
/// so an app kill (process crash, OS reclamation, OEM background killer)
/// does not lose the user's place.
///
/// "Fresh" is defined per spec: a checkpoint is restorable for 30 minutes
/// after [savedAt]. Older snapshots are silently discarded on next launch.
@immutable
class SessionCheckpoint {
  const SessionCheckpoint({
    required this.kind,
    required this.elapsed,
    required this.total,
    required this.cycle,
    required this.totalCycles,
    required this.focusSessionsCompleted,
    required this.savedAt,
  });

  final PeriodKind kind;
  final Duration elapsed;
  final Duration total;
  final int cycle;
  final int totalCycles;
  final int focusSessionsCompleted;
  final DateTime savedAt;

  static const Duration freshWindow = Duration(minutes: 30);

  bool isFreshAt(DateTime now) => now.difference(savedAt).abs() < freshWindow;

  bool get isFresh => isFreshAt(DateTime.now());

  Map<String, dynamic> toJson() => <String, dynamic>{
    'kind': kind.name,
    'elapsedMs': elapsed.inMilliseconds,
    'totalMs': total.inMilliseconds,
    'cycle': cycle,
    'totalCycles': totalCycles,
    'focusCompleted': focusSessionsCompleted,
    'savedAtIso': savedAt.toIso8601String(),
  };

  static SessionCheckpoint? fromJson(Map<String, dynamic> json) {
    try {
      return SessionCheckpoint(
        kind: PeriodKind.values.firstWhere((k) => k.name == json['kind']),
        elapsed: Duration(milliseconds: json['elapsedMs'] as int),
        total: Duration(milliseconds: json['totalMs'] as int),
        cycle: json['cycle'] as int,
        totalCycles: json['totalCycles'] as int,
        focusSessionsCompleted: json['focusCompleted'] as int,
        savedAt: DateTime.parse(json['savedAtIso'] as String),
      );
    } on Object {
      return null;
    }
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SessionCheckpoint &&
          other.kind == kind &&
          other.elapsed == elapsed &&
          other.total == total &&
          other.cycle == cycle &&
          other.totalCycles == totalCycles &&
          other.focusSessionsCompleted == focusSessionsCompleted &&
          other.savedAt == savedAt;

  @override
  int get hashCode => Object.hash(
    kind,
    elapsed,
    total,
    cycle,
    totalCycles,
    focusSessionsCompleted,
    savedAt,
  );
}
