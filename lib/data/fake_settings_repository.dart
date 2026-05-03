import 'dart:async';

import 'package:tomatito/core/sound/sound_bank.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/data/settings_repository.dart';

/// In-memory settings store used during Phase 1 development and in tests.
/// Round-trips changes synchronously (modulo the async signature) and
/// notifies via the `changes` stream.
class FakeSettingsRepository implements SettingsRepository {
  FakeSettingsRepository({
    SessionConfig? initialConfig,
    AppThemeId initialTheme = AppThemeId.tomatito,
    int initialDailyGoalMinutes = 120,
    bool initialAlwaysOnTop = false,
    String? initialChimeId,
    double initialChimeVolume = 0.6,
  }) : _config = initialConfig ?? SessionConfig.pomodoroDefault,
       _theme = initialTheme,
       _dailyGoal = initialDailyGoalMinutes,
       _alwaysOnTop = initialAlwaysOnTop,
       _chimeId = initialChimeId ?? SoundBank.defaultOption.id,
       _chimeVolume = initialChimeVolume;

  SessionConfig _config;
  AppThemeId _theme;
  int _dailyGoal;
  bool _alwaysOnTop;
  String _chimeId;
  double _chimeVolume;
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

  @override
  Future<bool> loadAlwaysOnTop() async => _alwaysOnTop;

  @override
  Future<void> saveAlwaysOnTop({required bool value}) async {
    _alwaysOnTop = value;
    _changes.add(null);
  }

  @override
  Future<String> loadChimeId() async => _chimeId;

  @override
  Future<void> saveChimeId(String id) async {
    _chimeId = id;
    _changes.add(null);
  }

  @override
  Future<double> loadChimeVolume() async => _chimeVolume;

  @override
  Future<void> saveChimeVolume(double volume) async {
    _chimeVolume = volume.clamp(0.0, 1.0);
    _changes.add(null);
  }

  Future<void> close() => _changes.close();
}
