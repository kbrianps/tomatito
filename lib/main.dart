import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:tomatito/app.dart';
import 'package:tomatito/core/app_lifecycle.dart';
import 'package:tomatito/core/bootstrap_result.dart';
import 'package:tomatito/core/entitlements/always_free_entitlement_service.dart';
import 'package:tomatito/core/entitlements/entitlement_service.dart';
import 'package:tomatito/core/locale/locale_choice.dart';
import 'package:tomatito/core/notifications/chime_recorder.dart';
import 'package:tomatito/core/notifications/no_op_notification_service.dart';
import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/notifications/persistent_notification_recorder.dart';
import 'package:tomatito/core/notifications/tick_recorder.dart';
import 'package:tomatito/core/sound/sound_player.dart';
import 'package:tomatito/core/statistics/stats_recorder.dart';
import 'package:tomatito/core/timer/checkpoint_store.dart';
import 'package:tomatito/core/timer/real_timer_engine.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/window/no_op_window_controller.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/core/window/window_state.dart';
import 'package:tomatito/data/json_statistics_repository.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/data/shared_prefs_settings_repository.dart';
import 'package:tomatito/data/statistics_repository.dart';
import 'package:tomatito/platform/android/android_notification_service.dart';
import 'package:tomatito/platform/desktop/desktop_window_controller.dart';
import 'package:tomatito/platform/desktop/linux_notification_service.dart';
import 'package:tomatito/presentation/screens/onboarding_screen.dart';
import 'package:window_manager/window_manager.dart';

bool get _isDesktop =>
    !kIsWeb && (Platform.isLinux || Platform.isMacOS || Platform.isWindows);
bool get _isAndroid => !kIsWeb && Platform.isAndroid;
bool get _isLinux => !kIsWeb && Platform.isLinux;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (_isDesktop) {
    await windowManager.ensureInitialized();
    await windowManager.setTitleBarStyle(
      TitleBarStyle.hidden,
      windowButtonVisibility: false,
    );
    // Best-effort transparent window background so the rounded ClipRRect
    // around the app body shows actual rounded corners. On Linux this
    // depends on the compositor; if transparency is not honoured the
    // window edges fall back to the OS default and the user still sees
    // the rounded inner content.
    await windowManager.setBackgroundColor(const Color(0x00000000));
  }

  await initializeDateFormatting();

  final prefs = await SharedPreferences.getInstance();
  final settings = SharedPrefsSettingsRepository(prefs);
  final stats = await JsonStatisticsRepository.create();
  final checkpointStore = await CheckpointStore.create();
  final engine = RealTimerEngine(checkpointStore: checkpointStore);

  final config = await settings.loadSessionConfig();
  final restoreResult = await engine.restoreFromCheckpointIfFresh(config);
  final oemTipShown = await settings.loadOemTipShown();
  final hasSeenOnboarding = await settings.loadHasSeenOnboarding();
  final localeChoice = await settings.loadLocaleChoice();
  final bootstrap = BootstrapResult(
    restoredFromCheckpoint: restoreResult.restored,
    // The OEM battery tip only makes sense on Android; on desktop the
    // foreground service does not exist and the user has no battery
    // optimisation to disable.
    shouldShowOemTip:
        _isAndroid && restoreResult.staleDiscarded && !oemTipShown,
  );

  final windowController =
      _isDesktop ? DesktopWindowController(prefs) : NoOpWindowController();
  final notificationService = _buildNotificationService();
  final soundPlayer = _buildSoundPlayer();

  final alwaysOnTopInitial = await settings.loadAlwaysOnTop();
  if (_isDesktop) {
    await windowController.restoreWindowState();
    await windowController.setAlwaysOnTop(value: alwaysOnTopInitial);
    windowManager.addListener(_PersistOnMoveListener(windowController));
  }

  final statsRecorder = StatsRecorder(
    engine: engine,
    stats: stats,
    settings: settings,
  )..start();
  final chimeRecorder = ChimeRecorder(
    engine: engine,
    notifications: notificationService,
    soundPlayer: soundPlayer,
    settings: settings,
  )..start();
  final persistentRecorder = PersistentNotificationRecorder(
    engine: engine,
    notifications: notificationService,
    settings: settings,
  );
  await persistentRecorder.start();
  final tickRecorder = TickRecorder(
    engine: engine,
    soundPlayer: soundPlayer,
    settings: settings,
  );
  await tickRecorder.start();

  // Holds the recorders for the lifetime of the app. A future
  // foreground-service coordinator will own this and call dispose; for now
  // the recorders simply outlive every other reference.
  // ignore: unused_local_variable
  final lifecycle = AppLifecycle(
    stats: statsRecorder,
    chime: chimeRecorder,
    persistent: persistentRecorder,
    tick: tickRecorder,
  );

  runApp(
    ProviderScope(
      overrides: [
        timerEngineProvider.overrideWithValue(engine),
        settingsRepositoryProvider.overrideWithValue(settings),
        statisticsRepositoryProvider.overrideWithValue(stats),
        notificationServiceProvider.overrideWithValue(notificationService),
        windowControllerProvider.overrideWithValue(windowController),
        entitlementServiceProvider.overrideWithValue(
          AlwaysFreeEntitlementService(),
        ),
        soundPlayerProvider.overrideWithValue(soundPlayer),
        bootstrapResultProvider.overrideWithValue(bootstrap),
        onboardingNeededProvider.overrideWith((ref) => !hasSeenOnboarding),
        alwaysOnTopProvider.overrideWith((ref) => alwaysOnTopInitial),
        localeChoiceProvider.overrideWith((ref) => localeChoice),
      ],
      child: const TomatitoApp(),
    ),
  );
}

NotificationService _buildNotificationService() {
  if (_isAndroid) return AndroidNotificationService();
  if (_isLinux) return LinuxNotificationService();
  return NoOpNotificationService();
}

SoundPlayer _buildSoundPlayer() {
  try {
    return JustAudioSoundPlayer();
  } on Object {
    return NoOpSoundPlayer();
  }
}

/// Saves the window bounds whenever the user moves or resizes the window.
/// Writes are async and quick; we accept the small chance of a partial
/// write at process kill since SharedPreferences is single-key atomic.
class _PersistOnMoveListener extends WindowListener {
  _PersistOnMoveListener(this._controller);

  final WindowController _controller;

  @override
  void onWindowResized() {
    unawaited(_controller.persistWindowState());
  }

  @override
  void onWindowMoved() {
    unawaited(_controller.persistWindowState());
  }
}
