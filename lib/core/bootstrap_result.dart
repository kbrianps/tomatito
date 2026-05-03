import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:meta/meta.dart' show immutable;

/// Snapshot of the conditions detected at app startup. Computed in `main()`
/// and exposed via [bootstrapResultProvider] so the UI can react once on
/// first frame.
///
///   * [restoredFromCheckpoint]: a fresh checkpoint was found and the
///     engine is now in TimerPaused. Triggers the "Resume your interrupted
///     focus period?" dialog in TimerScreen.
///   * [shouldShowOemTip]: a stale checkpoint was discarded AND the user
///     has not yet dismissed the OEM battery-management tip. Triggers a
///     one-time MaterialBanner in TimerScreen with guidance to allow
///     Tomatito to ignore battery optimisations.
@immutable
class BootstrapResult {
  const BootstrapResult({
    this.restoredFromCheckpoint = false,
    this.shouldShowOemTip = false,
  });

  static const BootstrapResult empty = BootstrapResult();

  final bool restoredFromCheckpoint;
  final bool shouldShowOemTip;
}

final bootstrapResultProvider = Provider<BootstrapResult>((ref) {
  return BootstrapResult.empty;
});
