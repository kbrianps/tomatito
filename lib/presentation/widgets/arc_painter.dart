import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';

/// Paints the dial as a smooth circular arc. The full ring is drawn in
/// [inactiveColor] as a guide; the "remaining" portion is overlaid in
/// [activeColor] starting at the current elapsed angle (clockwise from
/// 12 o'clock) and sweeping back to the start. As time passes the active
/// arc shrinks; at completion only the inactive ring is visible.
class ArcPainter extends CustomPainter {
  ArcPainter({
    required this.progress,
    required this.activeColor,
    required this.inactiveColor,
    this.strokeWidth = ThemeTokens.strokeRing * 2,
  });

  final double progress;
  final Color activeColor;
  final Color inactiveColor;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2 - strokeWidth / 2 - 2;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final inactivePaint =
        Paint()
          ..color = inactiveColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth
          ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, 0, 2 * math.pi, false, inactivePaint);

    final clamped = progress.clamp(0.0, 1.0);
    final elapsedAngle = clamped * 2 * math.pi;
    final remainingAngle = 2 * math.pi - elapsedAngle;
    if (remainingAngle > 0) {
      final activePaint =
          Paint()
            ..color = activeColor
            ..style = PaintingStyle.stroke
            ..strokeWidth = strokeWidth
            ..strokeCap = StrokeCap.round;
      canvas.drawArc(
        rect,
        -math.pi / 2 + elapsedAngle,
        remainingAngle,
        false,
        activePaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant ArcPainter old) =>
      old.progress != progress ||
      old.activeColor != activeColor ||
      old.inactiveColor != inactiveColor;
}
