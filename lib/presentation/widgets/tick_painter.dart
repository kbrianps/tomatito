import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';

/// Paints the dial. Each of [tickCount] short radial marks represents an
/// equal slice of the period. The marks "deplete" clockwise from the top
/// (12 o'clock) as time passes: at the start every tick is highlighted in
/// [activeColor]; as the period progresses the leading ticks fade to
/// [inactiveColor]; at completion no tick is highlighted.
///
/// This makes the question "how much time is left?" answerable at a
/// glance: the highlighted arc IS the remaining time.
class TickPainter extends CustomPainter {
  TickPainter({
    required this.progress,
    required this.activeColor,
    required this.inactiveColor,
    this.tickCount = ThemeTokens.dialTickCount,
    this.tickLength = ThemeTokens.dialTickLength,
    this.strokeWidth = ThemeTokens.strokeTick,
  });

  final double progress;
  final Color activeColor;
  final Color inactiveColor;
  final int tickCount;
  final double tickLength;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final outerRadius = math.min(size.width, size.height) / 2 - 2;
    final innerRadius = outerRadius - tickLength;

    final elapsedTicks = (progress.clamp(0.0, 1.0) * tickCount).round();

    final activePaint =
        Paint()
          ..color = activeColor
          ..strokeWidth = strokeWidth
          ..strokeCap = StrokeCap.round;
    final inactivePaint =
        Paint()
          ..color = inactiveColor
          ..strokeWidth = strokeWidth
          ..strokeCap = StrokeCap.round;

    for (var i = 0; i < tickCount; i++) {
      final angle = (i / tickCount) * 2 * math.pi - math.pi / 2;
      final outer = Offset(
        center.dx + math.cos(angle) * outerRadius,
        center.dy + math.sin(angle) * outerRadius,
      );
      final inner = Offset(
        center.dx + math.cos(angle) * innerRadius,
        center.dy + math.sin(angle) * innerRadius,
      );
      // Tick i is highlighted while it is still "ahead" of the elapsed
      // pointer; once the pointer has passed it, it dims.
      final isHighlighted = i >= elapsedTicks;
      canvas.drawLine(
        outer,
        inner,
        isHighlighted ? activePaint : inactivePaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant TickPainter old) =>
      old.progress != progress ||
      old.activeColor != activeColor ||
      old.inactiveColor != inactiveColor;
}
