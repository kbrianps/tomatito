import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/dial/dial_style.dart';
import 'package:tomatito/core/motion/motion_durations.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/presentation/widgets/animated_minute_text.dart';
import 'package:tomatito/presentation/widgets/arc_painter.dart';
import 'package:tomatito/presentation/widgets/tick_painter.dart';

class TimerDial extends ConsumerWidget {
  const TimerDial({
    required this.state,
    required this.size,
    this.activeColor,
    super.key,
  });

  final TimerState state;
  final double size;
  final Color? activeColor;

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
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final accent = activeColor ?? scheme.primary;
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
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: progress, end: progress),
              duration: MotionDurations.tickStep,
              builder:
                  (ctx, value, _) => CustomPaint(
                    size: Size(size, size),
                    painter: switch (dialStyle) {
                      DialStyle.ticks => TickPainter(
                        progress: value,
                        activeColor: accent,
                        inactiveColor: inactive,
                      ),
                      DialStyle.arc => ArcPainter(
                        progress: value,
                        activeColor: accent,
                        inactiveColor: inactive,
                      ),
                    },
                  ),
            ),
          ),
          if (remaining != null) AnimatedMinuteText(remaining: remaining),
        ],
      ),
    );
  }
}
