import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/timer/session_config.dart';

/// Persists user preferences (timer durations, theme, sound choices, etc.).
/// Production uses `SharedPreferencesSettingsRepository`; tests use a
/// `FakeSettingsRepository` that round-trips in memory.
abstract class SettingsRepository {
  Future<SessionConfig> loadSessionConfig();
  Future<void> saveSessionConfig(SessionConfig config);

  Future<AppThemeId> loadThemeId();
  Future<void> saveThemeId(AppThemeId id);

  Future<int> loadDailyGoalMinutes();
  Future<void> saveDailyGoalMinutes(int minutes);

  /// Whether the desktop window should stay on top of other windows.
  Future<bool> loadAlwaysOnTop();
  Future<void> saveAlwaysOnTop({required bool value});

  /// SoundBank id of the chime to play on period completion.
  Future<String> loadChimeId();
  Future<void> saveChimeId(String id);

  /// Volume of the chime, in [0.0 .. 1.0].
  Future<double> loadChimeVolume();
  Future<void> saveChimeVolume(double volume);

  /// Whether the persistent timer notification + Android foreground service
  /// is enabled. Off by default per spec.
  Future<bool> loadPersistentNotification();
  Future<void> savePersistentNotification({required bool value});

  /// Stream of changes so the UI can re-render without polling.
  Stream<void> get changes;
}

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  throw UnimplementedError(
    'settingsRepositoryProvider has no binding. Override it in main().',
  );
});
