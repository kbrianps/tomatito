import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tomatito/core/locale/locale_choice.dart';
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

  Future<bool> loadOemTipShown();
  Future<void> saveOemTipShown({required bool value});

  Future<bool> loadHasSeenOnboarding();
  Future<void> saveHasSeenOnboarding({required bool value});

  Future<bool> loadTickEnabled();
  Future<void> saveTickEnabled({required bool value});

  /// User locale preference (system / en / pt). System is the default.
  Future<LocaleChoice> loadLocaleChoice();
  Future<void> saveLocaleChoice(LocaleChoice choice);

  /// Stream of changes so the UI can re-render without polling.
  Stream<void> get changes;
}

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  throw UnimplementedError(
    'settingsRepositoryProvider has no binding. Override it in main().',
  );
});
