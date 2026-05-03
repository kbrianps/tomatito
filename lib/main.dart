import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/app.dart';
import 'package:tomatito/core/entitlements/always_free_entitlement_service.dart';
import 'package:tomatito/core/entitlements/entitlement_service.dart';
import 'package:tomatito/core/notifications/no_op_notification_service.dart';
import 'package:tomatito/core/notifications/notification_service.dart';
import 'package:tomatito/core/timer/fake_timer_engine.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/window/no_op_window_controller.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/data/fake_settings_repository.dart';
import 'package:tomatito/data/fake_statistics_repository.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/data/statistics_repository.dart';

void main() {
  runApp(
    ProviderScope(
      overrides: [
        timerEngineProvider.overrideWithValue(FakeTimerEngine()),
        settingsRepositoryProvider.overrideWithValue(FakeSettingsRepository()),
        statisticsRepositoryProvider.overrideWithValue(
          FakeStatisticsRepository(),
        ),
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
