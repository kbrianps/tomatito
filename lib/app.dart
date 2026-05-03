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
import 'package:tomatito/core/window/window_state.dart';
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
      // The shortcuts scope and the desktop title bar live OUTSIDE the
      // Navigator so they remain visible when routes are pushed (About,
      // licence page, dialogs, ...). The Navigator is the `child`.
      builder: (context, child) {
        // The shortcuts scope is desktop-only: on web the browser steals
        // Ctrl+R / Esc / Space-in-input anyway, AND the Focus widget the
        // scope installs trips a Flutter focus-engine assertion on
        // initial canvas focus before layout finishes.
        final body = _DesktopFrame(child: child ?? const SizedBox.shrink());
        if (kIsWeb) return body;
        return _ShortcutsScope(child: body);
      },
      home: const _RootRouter(),
    );
  }
}

/// Wraps the app body with the custom desktop title bar AND clips the
/// outer corners to a soft rounded rectangle. On Linux the GTK runner
/// (linux/runner/my_application.cc) enables an RGBA visual + transparent
/// FlView background so the corners actually look rounded against the
/// desktop instead of a black halo. macOS (Quartz) and Windows (DWM)
/// honour the transparent background set in main() out of the box.
/// Android / web platforms get a no-op wrapper; both the title bar and
/// the rounded shell are desktop-only.
class _DesktopFrame extends ConsumerWidget {
  const _DesktopFrame({required this.child});

  final Widget child;

  static const double _windowRadius = 12;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!_isDesktop) return child;
    final compact = ref.watch(compactModeProvider);
    final isShape =
        ref.watch(themeControllerProvider) == AppThemeId.tomatitoShape;
    // Shape compact: skip the title bar entirely so the tomato is the
    // window. _ShapedTimerView paints its own caption row inside the
    // tomato body. The ClipRRect is also dropped because the PNG has
    // its own rounded silhouette.
    if (isShape && compact) return child;
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
      // autofocus is desktop-only: on web it can fire focus traversal
      // before initial layout finishes and trip a "RenderBox was not
      // laid out" assertion. The user clicks the canvas anyway, which
      // gives the Focus widget keyboard input on web too.
      child: Focus(autofocus: !kIsWeb, child: child),
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
