import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/motion/motion_curves.dart';
import 'package:tomatito/core/motion/motion_durations.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/theme/theme_controller.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/screens/root_shell.dart';

class TomatitoApp extends ConsumerWidget {
  const TomatitoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeId = ref.watch(themeControllerProvider);
    final brightness = MediaQuery.platformBrightnessOf(context);
    return MaterialApp(
      onGenerateTitle: (ctx) => AppLocalizations.of(ctx).appName,
      theme: AppThemes.themeFor(themeId, platformBrightness: brightness),
      themeAnimationDuration: MotionDurations.long,
      themeAnimationCurve: MotionCurves.standard,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const _ShortcutsScope(child: RootShell()),
    );
  }
}

/// Wraps the root with the spec's keyboard shortcuts. Space toggles
/// play/pause; Ctrl+R resets; Ctrl+S skips. Settings (Ctrl+,) and Esc
/// (close modal / leave compact mode) ship in Phase 3.x.
class _ShortcutsScope extends ConsumerWidget {
  const _ShortcutsScope({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CallbackShortcuts(
      bindings: <ShortcutActivator, VoidCallback>{
        const SingleActivator(LogicalKeyboardKey.space):
            () => _togglePlayPause(ref),
        const SingleActivator(LogicalKeyboardKey.keyR, control: true):
            () => ref.read(timerEngineProvider).reset(),
        const SingleActivator(LogicalKeyboardKey.keyS, control: true):
            () => ref.read(timerEngineProvider).skip(),
      },
      child: Focus(autofocus: true, child: child),
    );
  }

  Future<void> _togglePlayPause(WidgetRef ref) async {
    final engine = ref.read(timerEngineProvider);
    final state = engine.current;
    if (state is TimerIdle) {
      final config =
          await ref.read(settingsRepositoryProvider).loadSessionConfig();
      engine.start(config);
    } else if (state is TimerRunning) {
      engine.pause();
    } else if (state is TimerPaused) {
      engine.resume();
    }
  }
}
