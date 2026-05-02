import 'package:flutter/widgets.dart';

/// Shared shape, spacing and type-scale tokens. All four themes vary the
/// ColorScheme only; structural tokens stay identical so layout does not
/// shift when the user switches themes.
final class ThemeTokens {
  const ThemeTokens._();

  // Radii
  static const double radiusCard = 12;
  static const double radiusButton = 20;
  static const double radiusPill = 999;

  // Spacing (4 dp grid)
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space5 = 20;
  static const double space6 = 24;
  static const double space8 = 32;

  // Strokes
  static const double strokeThin = 1;
  static const double strokeTick = 2;
  static const double strokeRing = 3;

  // Dial geometry
  static const double dialSizeRatio = 0.62;
  static const int dialTickCount = 30;
  static const double dialTickLength = 11;
  static const int dialActiveTickHighlight = 3;

  // Type scale (logical pixels)
  static const double typeBody = 14;
  static const double typeStatus = 13;
  static const double typeHeader = 14;
  static const double typeMinutesLarge = 68;
  static const double typeMinutesSmall = 56;
  static const double typeMinutesSuffix = 24;

  // Tap target minimum
  static const double minTapTarget = 48;

  // Compact-mode window size (desktop)
  static const Size compactWindowSize = Size(220, 260);

  // Tick colour opacity multiplier on top of onSurface.
  static const double tickInactiveOpacity = 0.16;
}
