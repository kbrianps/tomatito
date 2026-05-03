import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/theme/contrast_validator.dart';

void main() {
  group('ContrastValidator', () {
    test('white on black is 21:1', () {
      expect(
        ContrastValidator.ratio(
          const Color(0xFFFFFFFF),
          const Color(0xFF000000),
        ),
        closeTo(21, 0.01),
      );
    });

    test('identical colours give 1:1', () {
      expect(
        ContrastValidator.ratio(
          const Color(0xFF888888),
          const Color(0xFF888888),
        ),
        closeTo(1, 0.001),
      );
    });

    test('argument order does not affect result', () {
      const a = Color(0xFF1565C0);
      const b = Color(0xFFFAFAFA);
      expect(
        ContrastValidator.ratio(a, b),
        closeTo(ContrastValidator.ratio(b, a), 0.0001),
      );
    });

    test('passesNormalText threshold is exactly 4.5:1', () {
      expect(ContrastValidator.aaNormalText, 4.5);
    });
  });

  group('All fixed themes pass WCAG AA for the colour pairs the UI uses', () {
    for (final id in AppThemes.validatedSchemes) {
      final scheme = AppThemes.schemeFor(id);

      test('$id: onSurface on surface (body text >= 4.5:1)', () {
        final r = ContrastValidator.ratio(scheme.onSurface, scheme.surface);
        expect(
          ContrastValidator.passesNormalText(scheme.onSurface, scheme.surface),
          isTrue,
          reason: 'ratio = $r',
        );
      });

      test('$id: onPrimary on primary (button text >= 4.5:1)', () {
        final r = ContrastValidator.ratio(scheme.onPrimary, scheme.primary);
        expect(
          ContrastValidator.passesNormalText(scheme.onPrimary, scheme.primary),
          isTrue,
          reason: 'ratio = $r',
        );
      });

      test('$id: onSecondary on secondary (>= 4.5:1)', () {
        final r = ContrastValidator.ratio(scheme.onSecondary, scheme.secondary);
        expect(
          ContrastValidator.passesNormalText(
            scheme.onSecondary,
            scheme.secondary,
          ),
          isTrue,
          reason: 'ratio = $r',
        );
      });

      test('$id: onError on error (>= 4.5:1)', () {
        final r = ContrastValidator.ratio(scheme.onError, scheme.error);
        expect(
          ContrastValidator.passesNormalText(scheme.onError, scheme.error),
          isTrue,
          reason: 'ratio = $r',
        );
      });

      test('$id: primary on surface (graphical accent >= 3:1)', () {
        final r = ContrastValidator.ratio(scheme.primary, scheme.surface);
        expect(
          ContrastValidator.passesLargeOrGraphical(
            scheme.primary,
            scheme.surface,
          ),
          isTrue,
          reason: 'ratio = $r',
        );
      });

      test('$id: tertiary on surface (break-period dial accent >= 3:1)', () {
        final r = ContrastValidator.ratio(scheme.tertiary, scheme.surface);
        expect(
          ContrastValidator.passesLargeOrGraphical(
            scheme.tertiary,
            scheme.surface,
          ),
          isTrue,
          reason: 'ratio = $r',
        );
      });
    }
  });
}
