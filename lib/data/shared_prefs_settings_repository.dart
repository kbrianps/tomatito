import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:tomatito/core/locale/locale_choice.dart';
import 'package:tomatito/core/sound/sound_bank.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/data/settings_repository.dart';

/// Production settings store. Encodes `SessionConfig` as JSON; the theme,
/// daily goal, always-on-top flag, chime id and chime volume live in their
/// own keys for cheap reads. Falls back to defaults on missing or corrupt
/// data and writes a fresh value on next save.
class SharedPrefsSettingsRepository implements SettingsRepository {
  SharedPrefsSettingsRepository(this._prefs);

  final SharedPreferences _prefs;
  final StreamController<void> _changes = StreamController<void>.broadcast();

  static const String _keyConfig = 'tomatito.session_config.v1';
  static const String _keyTheme = 'tomatito.theme_id.v1';
  static const String _keyGoal = 'tomatito.daily_goal_minutes.v1';
  static const String _keyAlwaysOnTop = 'tomatito.always_on_top.v1';
  static const String _keyChimeId = 'tomatito.chime_id.v1';
  static const String _keyChimeVolume = 'tomatito.chime_volume.v1';
  static const String _keyPersistentNotification =
      'tomatito.persistent_notification.v1';
  static const String _keyOemTipShown = 'tomatito.oem_tip_shown.v1';
  static const String _keyHasSeenOnboarding = 'tomatito.has_seen_onboarding.v1';
  static const String _keyTickEnabled = 'tomatito.tick_enabled.v1';
  static const String _keyLocaleChoice = 'tomatito.locale_choice.v1';

  static Future<SharedPrefsSettingsRepository> create() async {
    final prefs = await SharedPreferences.getInstance();
    return SharedPrefsSettingsRepository(prefs);
  }

  @override
  Stream<void> get changes => _changes.stream;

  @override
  Future<SessionConfig> loadSessionConfig() async {
    final raw = _prefs.getString(_keyConfig);
    if (raw == null) return SessionConfig.pomodoroDefault;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return SessionConfig(
        focus: Duration(minutes: json['focusMin'] as int),
        shortBreak: Duration(minutes: json['shortBreakMin'] as int),
        longBreak: Duration(minutes: json['longBreakMin'] as int),
        cyclesBeforeLongBreak: json['cycles'] as int,
        autoStartBreaks: json['autoStartBreaks'] as bool? ?? true,
        autoStartFocus: json['autoStartFocus'] as bool? ?? false,
        strictMode: json['strict'] as bool? ?? false,
      );
    } on Object {
      return SessionConfig.pomodoroDefault;
    }
  }

  @override
  Future<void> saveSessionConfig(SessionConfig config) async {
    final json = <String, dynamic>{
      'focusMin': config.focus.inMinutes,
      'shortBreakMin': config.shortBreak.inMinutes,
      'longBreakMin': config.longBreak.inMinutes,
      'cycles': config.cyclesBeforeLongBreak,
      'autoStartBreaks': config.autoStartBreaks,
      'autoStartFocus': config.autoStartFocus,
      'strict': config.strictMode,
    };
    await _prefs.setString(_keyConfig, jsonEncode(json));
    _changes.add(null);
  }

  @override
  Future<AppThemeId> loadThemeId() async {
    final raw = _prefs.getString(_keyTheme);
    if (raw == null) return AppThemeId.tomatito;
    return AppThemeId.values.firstWhere(
      (id) => id.name == raw,
      orElse: () => AppThemeId.tomatito,
    );
  }

  @override
  Future<void> saveThemeId(AppThemeId id) async {
    await _prefs.setString(_keyTheme, id.name);
    _changes.add(null);
  }

  @override
  Future<int> loadDailyGoalMinutes() async {
    return _prefs.getInt(_keyGoal) ?? 120;
  }

  @override
  Future<void> saveDailyGoalMinutes(int minutes) async {
    await _prefs.setInt(_keyGoal, minutes);
    _changes.add(null);
  }

  @override
  Future<bool> loadAlwaysOnTop() async {
    return _prefs.getBool(_keyAlwaysOnTop) ?? false;
  }

  @override
  Future<void> saveAlwaysOnTop({required bool value}) async {
    await _prefs.setBool(_keyAlwaysOnTop, value);
    _changes.add(null);
  }

  @override
  Future<String> loadChimeId() async {
    return _prefs.getString(_keyChimeId) ?? SoundBank.defaultOption.id;
  }

  @override
  Future<void> saveChimeId(String id) async {
    await _prefs.setString(_keyChimeId, id);
    _changes.add(null);
  }

  @override
  Future<double> loadChimeVolume() async {
    return _prefs.getDouble(_keyChimeVolume) ?? 0.6;
  }

  @override
  Future<void> saveChimeVolume(double volume) async {
    await _prefs.setDouble(_keyChimeVolume, volume.clamp(0.0, 1.0));
    _changes.add(null);
  }

  @override
  Future<bool> loadPersistentNotification() async {
    return _prefs.getBool(_keyPersistentNotification) ?? false;
  }

  @override
  Future<void> savePersistentNotification({required bool value}) async {
    await _prefs.setBool(_keyPersistentNotification, value);
    _changes.add(null);
  }

  @override
  Future<bool> loadOemTipShown() async {
    return _prefs.getBool(_keyOemTipShown) ?? false;
  }

  @override
  Future<void> saveOemTipShown({required bool value}) async {
    await _prefs.setBool(_keyOemTipShown, value);
    _changes.add(null);
  }

  @override
  Future<bool> loadHasSeenOnboarding() async {
    return _prefs.getBool(_keyHasSeenOnboarding) ?? false;
  }

  @override
  Future<void> saveHasSeenOnboarding({required bool value}) async {
    await _prefs.setBool(_keyHasSeenOnboarding, value);
    _changes.add(null);
  }

  @override
  Future<bool> loadTickEnabled() async {
    return _prefs.getBool(_keyTickEnabled) ?? false;
  }

  @override
  Future<void> saveTickEnabled({required bool value}) async {
    await _prefs.setBool(_keyTickEnabled, value);
    _changes.add(null);
  }

  @override
  Future<LocaleChoice> loadLocaleChoice() async {
    return LocaleChoice.fromName(_prefs.getString(_keyLocaleChoice));
  }

  @override
  Future<void> saveLocaleChoice(LocaleChoice choice) async {
    await _prefs.setString(_keyLocaleChoice, choice.name);
    _changes.add(null);
  }

  Future<void> close() => _changes.close();
}
