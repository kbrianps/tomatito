import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/dial/dial_style.dart';
import 'package:tomatito/core/motion/motion_durations.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/presentation/widgets/animated_minute_text.dart';
import 'package:tomatito/presentation/widgets/arc_painter.dart';
import 'package:tomatito/presentation/widgets/tick_painter.dart';

class TimerDial extends ConsumerWidget {
  const TimerDial({
    required this.state,
    required this.size,
    this.activeColor,
    this.idleConfig,
    super.key,
  });

  final TimerState state;
  final double size;
  final Color? activeColor;

  /// When the engine is idle, display the configured focus duration in
  /// the centre of the dial instead of leaving it blank. Null falls back
  /// to no centre text (engine never started, no settings loaded yet).
  final SessionConfig? idleConfig;

  double _progress() {
    final s = state;
    if (s is TimerRunning) {
      return s.total.inMilliseconds == 0
          ? 0
          : s.elapsed.inMilliseconds / s.total.inMilliseconds;
    }
    if (s is TimerPaused) {
      return s.total.inMilliseconds == 0
          ? 0
          : s.elapsed.inMilliseconds / s.total.inMilliseconds;
    }
    return 0;
  }

  Duration? _remaining() {
    final s = state;
    if (s is TimerRunning) return s.remaining;
    if (s is TimerPaused) return s.remaining;
    if (s is TimerIdle && idleConfig != null) return idleConfig!.focus;
    return null;
  }

  PeriodKind? _currentKind() {
    final s = state;
    if (s is TimerRunning) return s.kind;
    if (s is TimerPaused) return s.kind;
    if (s is TimerPeriodComplete) return s.next ?? s.completed;
    if (s is TimerIdle) return PeriodKind.focus;
    return null;
  }

  /// Per-period accent. Focus uses the theme's `primary`; breaks use a
  /// distinct hue (`tertiary` short, `secondary` long) so the dial visibly
  /// shifts when the period changes. The 600 ms `ColorTween` in the dial
  /// body interpolates between values when this changes.
  static Color accentFor(ColorScheme scheme, PeriodKind? kind) =>
      switch (kind) {
        PeriodKind.focus => scheme.primary,
        PeriodKind.shortBreak => scheme.tertiary,
        PeriodKind.longBreak => scheme.secondary,
        null => scheme.primary,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final accent = activeColor ?? accentFor(scheme, _currentKind());
    final inactive = scheme.onSurface.withValues(
      alpha: ThemeTokens.tickInactiveOpacity,
    );
    final remaining = _remaining();
    final progress = _progress();
    final dialStyle = ref.watch(dialStyleProvider);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          RepaintBoundary(
            child: TweenAnimationBuilder<Color?>(
              tween: ColorTween(end: accent),
              duration: const Duration(milliseconds: 600),
              curve: Curves.easeOutCubic,
              builder: (ctx, animatedAccent, _) {
                return TweenAnimationBuilder<double>(
                  tween: Tween(begin: progress, end: progress),
                  duration: MotionDurations.tickStep,
                  builder: (ctx, value, _) {
                    final color = animatedAccent ?? accent;
                    return CustomPaint(
                      size: Size(size, size),
                      painter: switch (dialStyle) {
                        DialStyle.ticks => TickPainter(
                          progress: value,
                          activeColor: color,
                          inactiveColor: inactive,
                        ),
                        DialStyle.arc => ArcPainter(
                          progress: value,
                          activeColor: color,
                          inactiveColor: inactive,
                        ),
                      },
                    );
                  },
                );
              },
            ),
          ),
          if (remaining != null)
            AnimatedMinuteText(
              remaining: remaining,
              // Scale the digits to roughly 22% of the dial; the smallest
              // compact dial (~260 px) ends up ~57 px, the largest (~360 px)
              // ~80 px. Caps at the original Phase 1 token so a giant
              // window does not produce a giant clock face.
              fontSize: (size * 0.22).clamp(36, ThemeTokens.typeMinutesSmall),
            ),
        ],
      ),
    );
  }
}
