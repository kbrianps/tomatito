import 'package:flutter/material.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';

/// Center display of the dial. Renders MM:SS with no transition; the value
/// just changes in place when the engine emits a new tick. Tabular figures
/// keep the digits from shifting horizontally as they update. The optional
/// [fontSize] lets callers scale the digits to match the dial size; null
/// falls back to `ThemeTokens.typeMinutesSmall`.
class AnimatedMinuteText extends StatelessWidget {
  const AnimatedMinuteText({required this.remaining, this.fontSize, super.key});

  final Duration remaining;
  final double? fontSize;

  String get _displayText {
    final clamped = remaining.isNegative ? Duration.zero : remaining;
    final minutes = clamped.inMinutes.toString().padLeft(2, '0');
    final seconds = (clamped.inSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      _displayText,
      style: TextStyle(
        fontSize: fontSize ?? ThemeTokens.typeMinutesSmall,
        fontWeight: FontWeight.w300,
        color: theme.colorScheme.onSurface,
        height: 1,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }
}
