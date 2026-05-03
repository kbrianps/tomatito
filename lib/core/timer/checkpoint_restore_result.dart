import 'package:meta/meta.dart' show immutable;

/// Outcome of a `RealTimerEngine.restoreFromCheckpointIfFresh` call.
///
/// `restored` is true when a fresh checkpoint was found and the engine is
/// now in TimerPaused. `staleDiscarded` is true when a checkpoint existed
/// but was older than the spec's 30-minute freshness window (it was
/// silently cleared). The two flags are mutually exclusive; both are false
/// when no checkpoint existed at all.
@immutable
class CheckpointRestoreResult {
  const CheckpointRestoreResult({
    required this.restored,
    required this.staleDiscarded,
  });

  static const CheckpointRestoreResult none = CheckpointRestoreResult(
    restored: false,
    staleDiscarded: false,
  );

  static const CheckpointRestoreResult restoredOk = CheckpointRestoreResult(
    restored: true,
    staleDiscarded: false,
  );

  static const CheckpointRestoreResult staleCleared = CheckpointRestoreResult(
    restored: false,
    staleDiscarded: true,
  );

  final bool restored;
  final bool staleDiscarded;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CheckpointRestoreResult &&
          other.restored == restored &&
          other.staleDiscarded == staleDiscarded;

  @override
  int get hashCode => Object.hash(restored, staleDiscarded);
}
