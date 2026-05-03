import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/data/settings_repository.dart';

/// Production settings store. Encodes `SessionConfig` as JSON; the theme,
/// daily goal and always-on-top flag live in their own keys for cheap reads.
/// Falls back to defaults on missing or corrupt data and writes a fresh value
/// on next save.
class SharedPrefsSettingsRepository implements SettingsRepository {
  SharedPrefsSettingsRepository(this._prefs);

  final SharedPreferences _prefs;
  final StreamController<void> _changes = StreamController<void>.broadcast();

  static const String _keyConfig = 'tomatito.session_config.v1';
  static const String _keyTheme = 'tomatito.theme_id.v1';
  static const String _keyGoal = 'tomatito.daily_goal_minutes.v1';
  static const String _keyAlwaysOnTop = 'tomatito.always_on_top.v1';

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

  Future<void> close() => _changes.close();
}
