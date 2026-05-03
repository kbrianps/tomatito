import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:tomatito/core/dial/dial_style.dart';
import 'package:tomatito/core/locale/locale_choice.dart';
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

  test('always-on-top round-trips and defaults to false', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadAlwaysOnTop(), isFalse);
    await repo.saveAlwaysOnTop(value: true);
    expect(await repo.loadAlwaysOnTop(), isTrue);

    final fresh = await SharedPrefsSettingsRepository.create();
    expect(await fresh.loadAlwaysOnTop(), isTrue);
  });

  test('persistent notification round-trips and defaults to false', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadPersistentNotification(), isFalse);
    await repo.savePersistentNotification(value: true);
    expect(await repo.loadPersistentNotification(), isTrue);

    final fresh = await SharedPrefsSettingsRepository.create();
    expect(await fresh.loadPersistentNotification(), isTrue);
  });

  test('OEM tip shown round-trips and defaults to false', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadOemTipShown(), isFalse);
    await repo.saveOemTipShown(value: true);
    expect(await repo.loadOemTipShown(), isTrue);

    final fresh = await SharedPrefsSettingsRepository.create();
    expect(await fresh.loadOemTipShown(), isTrue);
  });

  test('has-seen-onboarding round-trips and defaults to false', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadHasSeenOnboarding(), isFalse);
    await repo.saveHasSeenOnboarding(value: true);
    expect(await repo.loadHasSeenOnboarding(), isTrue);

    final fresh = await SharedPrefsSettingsRepository.create();
    expect(await fresh.loadHasSeenOnboarding(), isTrue);
  });

  test('tick enabled round-trips and defaults to false', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadTickEnabled(), isFalse);
    await repo.saveTickEnabled(value: true);
    expect(await repo.loadTickEnabled(), isTrue);

    final fresh = await SharedPrefsSettingsRepository.create();
    expect(await fresh.loadTickEnabled(), isTrue);
  });

  test('locale choice round-trips and defaults to system', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadLocaleChoice(), LocaleChoice.system);
    await repo.saveLocaleChoice(LocaleChoice.pt);
    expect(await repo.loadLocaleChoice(), LocaleChoice.pt);

    final fresh = await SharedPrefsSettingsRepository.create();
    expect(await fresh.loadLocaleChoice(), LocaleChoice.pt);
  });

  test('dial style round-trips and defaults to ticks', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadDialStyle(), DialStyle.ticks);
    await repo.saveDialStyle(DialStyle.arc);
    expect(await repo.loadDialStyle(), DialStyle.arc);

    final fresh = await SharedPrefsSettingsRepository.create();
    expect(await fresh.loadDialStyle(), DialStyle.arc);
  });

  test('chime id and volume round-trip with sensible defaults', () async {
    final repo = await SharedPrefsSettingsRepository.create();
    expect(await repo.loadChimeId(), isNotEmpty);
    expect(await repo.loadChimeVolume(), closeTo(0.6, 0.001));
    await repo.saveChimeId('wood_block');
    await repo.saveChimeVolume(0.85);
    expect(await repo.loadChimeId(), 'wood_block');
    expect(await repo.loadChimeVolume(), closeTo(0.85, 0.001));
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
