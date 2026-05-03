import 'dart:async';

import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/data/settings_repository.dart';

/// In-memory settings store for Phase 1. Round-trips changes synchronously
/// (modulo the async signature) and notifies via the `changes` stream.
class FakeSettingsRepository implements SettingsRepository {
  FakeSettingsRepository({
    SessionConfig? initialConfig,
    AppThemeId initialTheme = AppThemeId.tomatito,
    int initialDailyGoalMinutes = 120,
  }) : _config = initialConfig ?? SessionConfig.pomodoroDefault,
       _theme = initialTheme,
       _dailyGoal = initialDailyGoalMinutes;

  SessionConfig _config;
  AppThemeId _theme;
  int _dailyGoal;
  final StreamController<void> _changes = StreamController<void>.broadcast();

  @override
  Stream<void> get changes => _changes.stream;

  @override
  Future<SessionConfig> loadSessionConfig() async => _config;

  @override
  Future<void> saveSessionConfig(SessionConfig config) async {
    _config = config;
    _changes.add(null);
  }

  @override
  Future<AppThemeId> loadThemeId() async => _theme;

  @override
  Future<void> saveThemeId(AppThemeId id) async {
    _theme = id;
    _changes.add(null);
  }

  @override
  Future<int> loadDailyGoalMinutes() async => _dailyGoal;

  @override
  Future<void> saveDailyGoalMinutes(int minutes) async {
    _dailyGoal = minutes;
    _changes.add(null);
  }

  Future<void> close() => _changes.close();
}
