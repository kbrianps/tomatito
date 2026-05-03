import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:tomatito/app.dart';
import 'package:tomatito/core/bootstrap_result.dart';
import 'package:tomatito/core/entitlements/always_free_entitlement_service.dart';
import 'package:tomatito/core/entitlements/entitlement_service.dart';
import 'package:tomatito/core/notifications/chime_recorder.dart';
import 'package:tomatito/core/notifications/no_op_notification_service.dart';
import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/notifications/persistent_notification_recorder.dart';
import 'package:tomatito/core/sound/sound_player.dart';
import 'package:tomatito/core/statistics/stats_recorder.dart';
import 'package:tomatito/core/timer/checkpoint_store.dart';
import 'package:tomatito/core/timer/real_timer_engine.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/window/no_op_window_controller.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/data/json_statistics_repository.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/data/shared_prefs_settings_repository.dart';
import 'package:tomatito/data/statistics_repository.dart';
import 'package:tomatito/platform/android/android_notification_service.dart';
import 'package:tomatito/platform/desktop/desktop_window_controller.dart';
import 'package:window_manager/window_manager.dart';

bool get _isDesktop =>
    !kIsWeb && (Platform.isLinux || Platform.isMacOS || Platform.isWindows);
bool get _isAndroid => !kIsWeb && Platform.isAndroid;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (_isDesktop) {
    await windowManager.ensureInitialized();
  }

  await initializeDateFormatting();

  final settings = await SharedPrefsSettingsRepository.create();
  final stats = await JsonStatisticsRepository.create();
  final checkpointStore = await CheckpointStore.create();
  final engine = RealTimerEngine(checkpointStore: checkpointStore);

  // Restore an interrupted session if the checkpoint is fresh (< 30 min);
  // detect a stale checkpoint to drive the OEM battery tip.
  final config = await settings.loadSessionConfig();
  final restoreResult = await engine.restoreFromCheckpointIfFresh(config);
  final oemTipShown = await settings.loadOemTipShown();
  final bootstrap = BootstrapResult(
    restoredFromCheckpoint: restoreResult.restored,
    shouldShowOemTip: restoreResult.staleDiscarded && !oemTipShown,
  );

  final windowController = _buildWindowController();
  final notificationService = _buildNotificationService();
  final soundPlayer = _buildSoundPlayer();

  if (_isDesktop) {
    final alwaysOnTop = await settings.loadAlwaysOnTop();
    await windowController.setAlwaysOnTop(value: alwaysOnTop);
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

  // Recorders are intentionally tied to app lifetime; nothing currently
  // disposes them. Replaced by an explicit lifecycle owner in a follow-up.
  _keepAlive(statsRecorder, chimeRecorder, persistentRecorder);

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
      ],
      child: const TomatitoApp(),
    ),
  );
}

WindowController _buildWindowController() =>
    _isDesktop ? DesktopWindowController() : NoOpWindowController();

NotificationService _buildNotificationService() =>
    _isAndroid ? AndroidNotificationService() : NoOpNotificationService();

SoundPlayer _buildSoundPlayer() {
  try {
    return JustAudioSoundPlayer();
  } on Object {
    return NoOpSoundPlayer();
  }
}

void _keepAlive(
  StatsRecorder s,
  ChimeRecorder c,
  PersistentNotificationRecorder p,
) {}
