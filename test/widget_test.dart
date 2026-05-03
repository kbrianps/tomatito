import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

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
  testWidgets('App boots and renders the navigation shell', (tester) async {
    // Use a comfortable surface; the desktop title bar (rendered because
    // the test host is Linux) needs room for its drag area + four caption
    // buttons.
    await tester.binding.setSurfaceSize(const Size(1200, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          timerEngineProvider.overrideWithValue(FakeTimerEngine()),
          settingsRepositoryProvider.overrideWithValue(
            FakeSettingsRepository(),
          ),
          statisticsRepositoryProvider.overrideWithValue(
            FakeStatisticsRepository(seedSampleData: false),
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
    await tester.pumpAndSettle();
    expect(find.text('Timer'), findsOneWidget);
    expect(find.text('Stats'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
  });
}
