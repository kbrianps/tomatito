/// Named durations matching the spec's motion timings. Use these instead of
/// inlining numbers so timings stay coherent across the app.
final class MotionDurations {
  const MotionDurations._();

  /// Button press, hover.
  static const Duration micro = Duration(milliseconds: 120);

  /// Toggles, color tweens, content fades.
  static const Duration standard = Duration(milliseconds: 220);

  /// Modal enter, sheet present, period change.
  static const Duration emphasized = Duration(milliseconds: 350);

  /// Theme cross-fade, page transition with content shift.
  static const Duration long = Duration(milliseconds: 500);

  /// Period color tween (Focus to Break) and active-tick sweep.
  static const Duration periodTransition = Duration(milliseconds: 600);

  /// End-of-period tick expand-and-fade flourish.
  static const Duration celebration = Duration(milliseconds: 500);

  /// Per-tick highlight tween while a period runs.
  static const Duration tickStep = Duration(milliseconds: 50);

  /// Center-number digit slide animation when minutes decrement.
  static const Duration digitSlide = Duration(milliseconds: 200);
}
