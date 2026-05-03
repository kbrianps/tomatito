import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/timer/session_config.dart';

/// Persists user preferences (timer durations, theme, sound choices, etc.).
abstract class SettingsRepository {
  Future<SessionConfig> loadSessionConfig();
  Future<void> saveSessionConfig(SessionConfig config);

  Future<AppThemeId> loadThemeId();
  Future<void> saveThemeId(AppThemeId id);

  Future<int> loadDailyGoalMinutes();
  Future<void> saveDailyGoalMinutes(int minutes);

  Future<bool> loadAlwaysOnTop();
  Future<void> saveAlwaysOnTop({required bool value});

  Future<String> loadChimeId();
  Future<void> saveChimeId(String id);

  Future<double> loadChimeVolume();
  Future<void> saveChimeVolume(double volume);

  Future<bool> loadPersistentNotification();
  Future<void> savePersistentNotification({required bool value});

  /// One-time OEM-battery-management tip: set true once the user dismisses
  /// the banner explaining that Android may pause the timer. Used to gate
  /// the banner so it does not nag the user repeatedly.
  Future<bool> loadOemTipShown();
  Future<void> saveOemTipShown({required bool value});

  /// Stream of changes so the UI can re-render without polling.
  Stream<void> get changes;
}

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  throw UnimplementedError(
    'settingsRepositoryProvider has no binding. Override it in main().',
  );
});
