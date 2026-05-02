import 'package:flutter/animation.dart';

/// Shared motion curves. Material 3 emphasized curves are the default for
/// content motion; linear is reserved for the timer's own progress, never UI.
final class MotionCurves {
  const MotionCurves._();

  /// In-and-out tweens (size, color, theme switch).
  static const Curve standard = Curves.easeInOutCubicEmphasized;

  /// Entrances.
  static const Curve enter = Curves.easeOutCubic;

  /// Exits.
  static const Curve exit = Curves.easeInCubic;

  /// Linear is reserved for the timer's own progress, never UI motion.
  static const Curve linear = Curves.linear;
}
