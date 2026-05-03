import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/locale/locale_choice.dart';
import 'package:tomatito/core/motion/motion_curves.dart';
import 'package:tomatito/core/motion/motion_durations.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/theme/theme_controller.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/screens/onboarding_screen.dart';
import 'package:tomatito/presentation/screens/root_shell.dart';
import 'package:tomatito/presentation/widgets/tomatito_title_bar.dart';

bool get _isDesktop =>
    !kIsWeb && (Platform.isLinux || Platform.isMacOS || Platform.isWindows);

/// Root Navigator key. Used by Esc keyboard shortcut to dismiss modal
/// routes (license page, About screen, etc.) without needing a BuildContext.
final tomatitoNavigatorKey = GlobalKey<NavigatorState>();

class TomatitoApp extends ConsumerWidget {
  const TomatitoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeId = ref.watch(themeControllerProvider);
    final brightness = MediaQuery.platformBrightnessOf(context);
    final localeChoice = ref.watch(localeChoiceProvider);
    return MaterialApp(
      navigatorKey: tomatitoNavigatorKey,
      onGenerateTitle: (ctx) => AppLocalizations.of(ctx).appName,
      theme: AppThemes.themeFor(themeId, platformBrightness: brightness),
      themeAnimationDuration: MotionDurations.long,
      themeAnimationCurve: MotionCurves.standard,
      locale: localeChoice.toLocale(),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const _ShortcutsScope(child: _DesktopFrame(child: _RootRouter())),
    );
  }
}

/// Wraps the app body with the custom desktop title bar AND clips the
/// outer corners to a soft rounded rectangle. On Android / web / other
/// platforms the wrapper is a no-op; the title bar and the rounded shell
/// are desktop-only. The actual window background is set transparent in
/// main() so the rounded corners can show through on compositors that
/// honour it.
class _DesktopFrame extends StatelessWidget {
  const _DesktopFrame({required this.child});

  final Widget child;

  static const double _windowRadius = 12;

  @override
  Widget build(BuildContext context) {
    if (!_isDesktop) return child;
    return ClipRRect(
      borderRadius: const BorderRadius.all(Radius.circular(_windowRadius)),
      child: Column(
        children: [const TomatitoTitleBar(), Expanded(child: child)],
      ),
    );
  }
}

/// Switches between the welcome tour and the main shell. The flag is
/// `onboardingNeededProvider`, owned by `OnboardingScreen`.
class _RootRouter extends ConsumerWidget {
  const _RootRouter();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showOnboarding = ref.watch(onboardingNeededProvider);
    return AnimatedSwitcher(
      duration: MotionDurations.long,
      switchInCurve: MotionCurves.enter,
      switchOutCurve: MotionCurves.exit,
      child:
          showOnboarding
              ? const OnboardingScreen(key: ValueKey('onboarding'))
              : const RootShell(key: ValueKey('root')),
    );
  }
}

/// Wraps the root with the spec's keyboard shortcuts.
///
/// * Space: play / pause
/// * Ctrl+R: reset
/// * Ctrl+S: skip current period
/// * Ctrl+,: open Settings tab
/// * Esc: pop the topmost modal route
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
        const SingleActivator(LogicalKeyboardKey.comma, control: true):
            () => ref.read(navigationIndexProvider.notifier).state = 2,
        const SingleActivator(LogicalKeyboardKey.escape):
            () => tomatitoNavigatorKey.currentState?.maybePop(),
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
