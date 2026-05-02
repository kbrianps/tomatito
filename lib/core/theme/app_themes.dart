import 'package:flutter/material.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';

/// The four themes shipped in v1. Each is a hand-tuned ColorScheme that
/// passes WCAG AA for the text / surface combinations the app uses; verified
/// programmatically by `test/core/theme/contrast_validator_test.dart`.
enum AppThemeId { light, dark, blackOled, tomatito }

final class AppThemes {
  const AppThemes._();

  /// The signature spec value (~#E74C3C). Used as a brand-mark constant in
  /// places where the WCAG bar is 3:1 (icons, splash, dial active ticks
  /// against the warm Tomatito surface). For ColorScheme.primary, see
  /// [tomatitoScheme] which uses a slightly darker shade so on-primary text
  /// passes the 4.5:1 normal-text bar. See docs/GAPS.md for the rationale.
  static const Color tomatitoBrand = Color(0xFFE74C3C);

  static const Color _tomatitoLeaf = Color(0xFF3F7330);
  static const Color _tomatitoSurface = Color(0xFFFAF6F1);
  static const Color _tomatitoOnSurface = Color(0xFF2A1A14);

  static const ColorScheme lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFF1565C0),
    onPrimary: Color(0xFFFFFFFF),
    secondary: Color(0xFF455A64),
    onSecondary: Color(0xFFFFFFFF),
    surface: Color(0xFFFAFAFA),
    onSurface: Color(0xFF1B1B1B),
    error: Color(0xFFB00020),
    onError: Color(0xFFFFFFFF),
  );

  static const ColorScheme darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFF82B1FF),
    onPrimary: Color(0xFF002C6E),
    secondary: Color(0xFFB0BEC5),
    onSecondary: Color(0xFF1B2A30),
    surface: Color(0xFF1F1F22),
    onSurface: Color(0xFFE9E9EC),
    error: Color(0xFFFF8A80),
    onError: Color(0xFF410002),
  );

  static const ColorScheme blackOledScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFFFF5252),
    onPrimary: Color(0xFF000000),
    secondary: Color(0xFF8AB4F8),
    onSecondary: Color(0xFF000000),
    surface: Color(0xFF000000),
    onSurface: Color(0xFFFFFFFF),
    error: Color(0xFFFF8A80),
    onError: Color(0xFF000000),
  );

  static const ColorScheme tomatitoScheme = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFFC0392B),
    onPrimary: Color(0xFFFFFFFF),
    secondary: _tomatitoLeaf,
    onSecondary: Color(0xFFFFFFFF),
    surface: _tomatitoSurface,
    onSurface: _tomatitoOnSurface,
    error: Color(0xFF8B0000),
    onError: Color(0xFFFFFFFF),
  );

  static ColorScheme schemeFor(AppThemeId id) => switch (id) {
    AppThemeId.light => lightScheme,
    AppThemeId.dark => darkScheme,
    AppThemeId.blackOled => blackOledScheme,
    AppThemeId.tomatito => tomatitoScheme,
  };

  static ThemeData themeFor(AppThemeId id) {
    final scheme = schemeFor(id);
    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      scaffoldBackgroundColor: scheme.surface,
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: scheme.onSurface.withValues(alpha: 0.08)),
          borderRadius: BorderRadius.circular(ThemeTokens.radiusCard),
        ),
      ),
    );
  }
}
