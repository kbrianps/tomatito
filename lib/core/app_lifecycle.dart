import 'package:tomatito/core/notifications/chime_recorder.dart';
import 'package:tomatito/core/notifications/persistent_notification_recorder.dart';
import 'package:tomatito/core/notifications/tick_recorder.dart';
import 'package:tomatito/core/statistics/stats_recorder.dart';

/// Owns the long-lived recorders that bridge the engine to side effects
/// (statistics, chime, persistent notification, focus tick). Replaces the
/// earlier `_keepAlive(...)` no-op in main with an explicit owner that has
/// a `dispose` for symmetry; in Phase 4 a foreground-service coordinator
/// will become the dispose caller, but until then the recorders live for
/// the entire app process and `dispose` is informational.
class AppLifecycle {
  AppLifecycle({
    required this.stats,
    required this.chime,
    required this.persistent,
    required this.tick,
  });

  final StatsRecorder stats;
  final ChimeRecorder chime;
  final PersistentNotificationRecorder persistent;
  final TickRecorder tick;

  Future<void> dispose() async {
    await stats.dispose();
    await chime.dispose();
    await persistent.dispose();
    await tick.dispose();
  }
}
