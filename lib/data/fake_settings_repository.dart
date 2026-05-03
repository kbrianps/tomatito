import 'dart:async';

import 'package:tomatito/core/dial/dial_style.dart';
import 'package:tomatito/core/locale/locale_choice.dart';
import 'package:tomatito/core/sound/sound_bank.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/data/settings_repository.dart';

/// In-memory settings store used during Phase 1 development and in tests.
class FakeSettingsRepository implements SettingsRepository {
  FakeSettingsRepository({
    SessionConfig? initialConfig,
    AppThemeId initialTheme = AppThemeId.tomatito,
    int initialDailyGoalMinutes = 120,
    bool initialAlwaysOnTop = false,
    String? initialChimeId,
    double initialChimeVolume = 0.6,
    bool initialPersistentNotification = false,
    bool initialOemTipShown = false,
    bool initialHasSeenOnboarding = false,
    bool initialTickEnabled = false,
    LocaleChoice initialLocaleChoice = LocaleChoice.system,
    DialStyle initialDialStyle = DialStyle.ticks,
  }) : _config = initialConfig ?? SessionConfig.pomodoroDefault,
       _theme = initialTheme,
       _dailyGoal = initialDailyGoalMinutes,
       _alwaysOnTop = initialAlwaysOnTop,
       _chimeId = initialChimeId ?? SoundBank.defaultOption.id,
       _chimeVolume = initialChimeVolume,
       _persistentNotification = initialPersistentNotification,
       _oemTipShown = initialOemTipShown,
       _hasSeenOnboarding = initialHasSeenOnboarding,
       _tickEnabled = initialTickEnabled,
       _localeChoice = initialLocaleChoice,
       _dialStyle = initialDialStyle;

  SessionConfig _config;
  AppThemeId _theme;
  int _dailyGoal;
  bool _alwaysOnTop;
  String _chimeId;
  double _chimeVolume;
  bool _persistentNotification;
  bool _oemTipShown;
  bool _hasSeenOnboarding;
  bool _tickEnabled;
  LocaleChoice _localeChoice;
  DialStyle _dialStyle;
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

  @override
  Future<bool> loadPersistentNotification() async => _persistentNotification;

  @override
  Future<void> savePersistentNotification({required bool value}) async {
    _persistentNotification = value;
    _changes.add(null);
  }

  @override
  Future<bool> loadOemTipShown() async => _oemTipShown;

  @override
  Future<void> saveOemTipShown({required bool value}) async {
    _oemTipShown = value;
    _changes.add(null);
  }

  @override
  Future<bool> loadHasSeenOnboarding() async => _hasSeenOnboarding;

  @override
  Future<void> saveHasSeenOnboarding({required bool value}) async {
    _hasSeenOnboarding = value;
    _changes.add(null);
  }

  @override
  Future<bool> loadTickEnabled() async => _tickEnabled;

  @override
  Future<void> saveTickEnabled({required bool value}) async {
    _tickEnabled = value;
    _changes.add(null);
  }

  @override
  Future<LocaleChoice> loadLocaleChoice() async => _localeChoice;

  @override
  Future<void> saveLocaleChoice(LocaleChoice choice) async {
    _localeChoice = choice;
    _changes.add(null);
  }

  @override
  Future<DialStyle> loadDialStyle() async => _dialStyle;

  @override
  Future<void> saveDialStyle(DialStyle style) async {
    _dialStyle = style;
    _changes.add(null);
  }

  Future<void> close() => _changes.close();
}
