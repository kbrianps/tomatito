import 'dart:math' as math;
import 'dart:ui';

/// WCAG 2.1 contrast helpers used to verify the four shipped themes meet the
/// accessibility bar set by the spec.
///
/// Bars:
/// - Normal text:        4.5:1 (AA)
/// - Large text & icons: 3.0:1 (AA)
/// - AAA enhanced:       7.0:1 (informational only)
final class ContrastValidator {
  const ContrastValidator._();

  static const double aaNormalText = 4.5;
  static const double aaLargeOrGraphical = 3;
  static const double aaaEnhanced = 7;

  /// Returns the WCAG 2.1 contrast ratio between [a] and [b], in the range
  /// 1.0 .. 21.0. Argument order is irrelevant.
  static double ratio(Color a, Color b) {
    final l1 = _relativeLuminance(a);
    final l2 = _relativeLuminance(b);
    final lighter = math.max(l1, l2);
    final darker = math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  static bool passesNormalText(Color fg, Color bg) =>
      ratio(fg, bg) >= aaNormalText;

  static bool passesLargeOrGraphical(Color fg, Color bg) =>
      ratio(fg, bg) >= aaLargeOrGraphical;

  static bool passesAaa(Color fg, Color bg) => ratio(fg, bg) >= aaaEnhanced;

  static double _relativeLuminance(Color c) =>
      0.2126 * _linearise(c.r) +
      0.7152 * _linearise(c.g) +
      0.0722 * _linearise(c.b);

  static double _linearise(double srgb) =>
      srgb <= 0.04045
          ? srgb / 12.92
          : math.pow((srgb + 0.055) / 1.055, 2.4).toDouble();
}
