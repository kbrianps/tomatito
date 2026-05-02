import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/timer/session_config.dart';

/// Persists user preferences (timer durations, theme, sound choices, etc.).
/// Phase 2 ships `SharedPreferencesSettingsRepository`; Phase 1 uses a
/// `FakeSettingsRepository` that round-trips in memory.
abstract class SettingsRepository {
  Future<SessionConfig> loadSessionConfig();
  Future<void> saveSessionConfig(SessionConfig config);

  Future<AppThemeId> loadThemeId();
  Future<void> saveThemeId(AppThemeId id);

  Future<int> loadDailyGoalMinutes();
  Future<void> saveDailyGoalMinutes(int minutes);

  /// Stream of changes so the UI can re-render without polling.
  Stream<void> get changes;
}

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  throw UnimplementedError(
    'settingsRepositoryProvider has no binding. Override it in main().',
  );
});
