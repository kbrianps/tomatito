import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/data/fake_settings_repository.dart';
import 'package:tomatito/data/fake_statistics_repository.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/data/statistics_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/screens/statistics_screen.dart';

Widget _wrap({required List<Override> overrides}) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(
      localizationsDelegates: [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: StatisticsScreen()),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
  });

  testWidgets('shows the empty state when no completions exist',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      _wrap(
        overrides: [
          statisticsRepositoryProvider.overrideWithValue(
            FakeStatisticsRepository(seedSampleData: false),
          ),
          settingsRepositoryProvider.overrideWithValue(
            FakeSettingsRepository(),
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Complete your first session to see your stats here.'),
      findsOneWidget,
    );
  });

  testWidgets('renders hero metrics, charts, and the achievements grid '
      'when there is seeded data', (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 2000));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final repo = FakeStatisticsRepository(seedSampleData: false);
    // Three completions for "today" so the hero grid has visible numbers.
    final now = DateTime.now();
    for (var i = 0; i < 3; i++) {
      await repo.recordCompletion(
        kind: PeriodKind.focus,
        duration: const Duration(minutes: 25),
        endedAtLocal: DateTime(now.year, now.month, now.day, 10, i),
      );
    }

    await tester.pumpWidget(
      _wrap(
        overrides: [
          statisticsRepositoryProvider.overrideWithValue(repo),
          settingsRepositoryProvider.overrideWithValue(
            FakeSettingsRepository(),
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Today'), findsWidgets);
    expect(find.text('This week'), findsWidgets);
    expect(find.text('Sessions'), findsOneWidget);
    expect(find.text('By day of week'), findsOneWidget);
    expect(find.text('By hour of day'), findsOneWidget);
    expect(find.text('Achievements'), findsOneWidget);
    // First-session achievement should be unlocked after one completion.
    expect(find.text('First focus'), findsOneWidget);
  });

  testWidgets('reloads when the repository emits a change while mounted',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 2000));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final repo = FakeStatisticsRepository(seedSampleData: false);
    await tester.pumpWidget(
      _wrap(
        overrides: [
          statisticsRepositoryProvider.overrideWithValue(repo),
          settingsRepositoryProvider.overrideWithValue(
            FakeSettingsRepository(),
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();

    // Empty state up.
    expect(
      find.text('Complete your first session to see your stats here.'),
      findsOneWidget,
    );

    // Record a completion: the screen subscribes to changes and should
    // refresh into the populated view.
    await repo.recordCompletion(
      kind: PeriodKind.focus,
      duration: const Duration(minutes: 25),
      endedAtLocal: DateTime.now(),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Complete your first session to see your stats here.'),
      findsNothing,
    );
    expect(find.text('Achievements'), findsOneWidget);
  });
}
