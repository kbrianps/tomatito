import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';

/// Paints the dial: a ring of [tickCount] short radial marks, with
/// [activeHighlightCount] adjacent marks in [activeColor] positioned at the
/// current [progress] (0.0 .. 1.0). The active group sweeps continuously as
/// progress changes; the painter only repaints when its inputs change.
class TickPainter extends CustomPainter {
  TickPainter({
    required this.progress,
    required this.activeColor,
    required this.inactiveColor,
    this.tickCount = ThemeTokens.dialTickCount,
    this.activeHighlightCount = ThemeTokens.dialActiveTickHighlight,
    this.tickLength = ThemeTokens.dialTickLength,
    this.strokeWidth = ThemeTokens.strokeTick,
  });

  final double progress;
  final Color activeColor;
  final Color inactiveColor;
  final int tickCount;
  final int activeHighlightCount;
  final double tickLength;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final outerRadius = math.min(size.width, size.height) / 2 - 2;
    final innerRadius = outerRadius - tickLength;

    final activeStart = (progress * tickCount) - activeHighlightCount / 2;

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
      final isActive = _isActive(
        i,
        activeStart,
        activeHighlightCount,
        tickCount,
      );
      canvas.drawLine(outer, inner, isActive ? activePaint : inactivePaint);
    }
  }

  bool _isActive(int index, double startFloat, int count, int total) {
    for (var k = 0; k < count; k++) {
      final t = (startFloat + k).floor() % total;
      if (t == index) return true;
    }
    return false;
  }

  @override
  bool shouldRepaint(covariant TickPainter old) =>
      old.progress != progress ||
      old.activeColor != activeColor ||
      old.inactiveColor != inactiveColor;
}
