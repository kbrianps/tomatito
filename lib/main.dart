import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/app.dart';
import 'package:tomatito/core/entitlements/always_free_entitlement_service.dart';
import 'package:tomatito/core/entitlements/entitlement_service.dart';
import 'package:tomatito/core/notifications/no_op_notification_service.dart';
import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/statistics/stats_recorder.dart';
import 'package:tomatito/core/timer/real_timer_engine.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/window/no_op_window_controller.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/data/json_statistics_repository.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/data/shared_prefs_settings_repository.dart';
import 'package:tomatito/data/statistics_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final settings = await SharedPrefsSettingsRepository.create();
  final stats = await JsonStatisticsRepository.create();
  final engine = RealTimerEngine();

  final recorder = StatsRecorder(
    engine: engine,
    stats: stats,
    settings: settings,
  )..start();

  // Recorder is intentionally tied to app lifetime; nothing currently disposes
  // it. When notifications/foreground service land, we may need a coordinator.
  _keepAlive(recorder);

  runApp(
    ProviderScope(
      overrides: [
        timerEngineProvider.overrideWithValue(engine),
        settingsRepositoryProvider.overrideWithValue(settings),
        statisticsRepositoryProvider.overrideWithValue(stats),
        notificationServiceProvider.overrideWithValue(
          NoOpNotificationService(),
        ),
        windowControllerProvider.overrideWithValue(NoOpWindowController()),
        entitlementServiceProvider.overrideWithValue(
          AlwaysFreeEntitlementService(),
        ),
      ],
      child: const TomatitoApp(),
    ),
  );
}

/// Holds a reference so the recorder is not garbage-collected while the app
/// is running. Replaced by an explicit lifecycle owner in Phase 3.
void _keepAlive(StatsRecorder recorder) {}
