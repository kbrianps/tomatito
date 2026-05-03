import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/data/shared_prefs_settings_repository.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  test('defaults are returned when nothing is stored', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadSessionConfig(), SessionConfig.pomodoroDefault);
    expect(await repo.loadThemeId(), AppThemeId.tomatito);
    expect(await repo.loadDailyGoalMinutes(), 120);
  });

  test('SessionConfig round-trips through JSON encoding', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    final cfg = SessionConfig.pomodoroDefault.copyWith(
      focus: const Duration(minutes: 50),
      shortBreak: const Duration(minutes: 10),
      strictMode: true,
    );
    await repo.saveSessionConfig(cfg);

    final fresh = await SharedPrefsSettingsRepository.create();
    expect(await fresh.loadSessionConfig(), cfg);
  });

  test('theme id round-trips', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    await repo.saveThemeId(AppThemeId.blackOled);
    expect(await repo.loadThemeId(), AppThemeId.blackOled);
  });

  test('daily goal round-trips', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    await repo.saveDailyGoalMinutes(180);
    expect(await repo.loadDailyGoalMinutes(), 180);
  });

  test('corrupt JSON falls back to defaults', () async {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'tomatito.session_config.v1': 'this is not json',
    });
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadSessionConfig(), SessionConfig.pomodoroDefault);
  });

  test('changes stream notifies on every save', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    final events = <void>[];
    final sub = repo.changes.listen(events.add);
    await repo.saveDailyGoalMinutes(60);
    await repo.saveThemeId(AppThemeId.dark);
    await Future<void>.delayed(Duration.zero);
    expect(events.length, 2);
    await sub.cancel();
    await repo.close();
  });
}
