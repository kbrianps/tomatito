import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/app.dart';
import 'package:tomatito/core/entitlements/always_free_entitlement_service.dart';
import 'package:tomatito/core/entitlements/entitlement_service.dart';
import 'package:tomatito/core/notifications/chime_recorder.dart';
import 'package:tomatito/core/notifications/no_op_notification_service.dart';
import 'package:tomatito/core/notifications/notification_service.dart';
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

  final settings = await SharedPrefsSettingsRepository.create();
  final stats = await JsonStatisticsRepository.create();
  final checkpointStore = await CheckpointStore.create();
  final engine = RealTimerEngine(checkpointStore: checkpointStore);

  // Restore an interrupted session if the checkpoint is fresh (< 30 min).
  // The engine emits TimerPaused on success; the user resumes from the
  // dial. Stale checkpoints are silently cleared.
  final config = await settings.loadSessionConfig();
  await engine.restoreFromCheckpointIfFresh(config);

  final windowController = _buildWindowController();
  final notificationService = _buildNotificationService();

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
  )..start();

  // Recorders are intentionally tied to app lifetime; nothing currently
  // disposes them. Replaced by an explicit lifecycle owner in Phase 3.x
  // alongside the foreground service.
  _keepAlive(statsRecorder, chimeRecorder);

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
      ],
      child: const TomatitoApp(),
    ),
  );
}

WindowController _buildWindowController() =>
    _isDesktop ? DesktopWindowController() : NoOpWindowController();

NotificationService _buildNotificationService() =>
    _isAndroid ? AndroidNotificationService() : NoOpNotificationService();

void _keepAlive(StatsRecorder s, ChimeRecorder c) {}
