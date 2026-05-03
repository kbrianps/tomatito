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
import 'package:tomatito/core/dial/dial_style.dart';
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
import 'package:tomatito/platform/desktop/autostart_manager.dart';
import 'package:tomatito/platform/desktop/desktop_window_controller.dart';
import 'package:tomatito/platform/desktop/linux_notification_service.dart';
import 'package:tomatito/platform/desktop/tray_controller.dart';
import 'package:tomatito/presentation/screens/onboarding_screen.dart';
import 'package:window_manager/window_manager.dart';

/// Provider for the optional system tray controller (desktop only). Null
/// outside desktop / when initialisation failed.
final trayControllerProvider = Provider<TrayController?>((ref) => null);

/// Provider for the autostart helper. Always non-null; the helper itself
/// no-ops on platforms where autostart is unsupported.
final autostartManagerProvider =
    Provider<AutostartManager>((ref) => AutostartManager());

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
    // Constrain how far the user can drag-resize the window. Below the
    // minimum the dial collides with the controls; above the maximum the
    // single-column layout looks lonely and the dial font would race the
    // 80px cap. Compact mode lives inside this min so resize handles
    // remain usable in the small window.
    await windowManager.setMinimumSize(const Size(240, 320));
    await windowManager.setMaximumSize(const Size(900, 1300));
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
  final dialStyle = await settings.loadDialStyle();
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
  TrayController? tray;
  if (_isDesktop) {
    await windowController.restoreWindowState();
    await windowController.setAlwaysOnTop(value: alwaysOnTopInitial);
    windowManager.addListener(_PersistOnMoveListener(windowController));
    tray = TrayController();
    await tray.install();
  }
  // Reconcile the autostart entry with the saved preference so a user
  // who toggled it off elsewhere (deleted the .desktop / launch agent /
  // registry key by hand, restored from backup, etc.) lands on a
  // consistent state at boot. Cross-platform via launch_at_startup.
  if (_isDesktop) {
    final wantAutostart = await settings.loadAutostart();
    final autostart = AutostartManager();
    final actuallyEnabled = await autostart.isEnabled();
    if (wantAutostart && !actuallyEnabled) {
      await autostart.enable();
    } else if (!wantAutostart && actuallyEnabled) {
      await autostart.disable();
    }
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
        if (tray != null) trayControllerProvider.overrideWithValue(tray),
        bootstrapResultProvider.overrideWithValue(bootstrap),
        onboardingNeededProvider.overrideWith((ref) => !hasSeenOnboarding),
        alwaysOnTopProvider.overrideWith((ref) => alwaysOnTopInitial),
        localeChoiceProvider.overrideWith((ref) => localeChoice),
        dialStyleProvider.overrideWith((ref) => dialStyle),
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
    // just_audio has no native Linux implementation (calls silently
    // no-op); use audioplayers' GStreamer backend there instead.
    if (_isLinux) return AudioplayersSoundPlayer();
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
