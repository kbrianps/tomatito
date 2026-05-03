import 'package:flutter/material.dart';

import 'package:tomatito/core/motion/motion_durations.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';

/// Center display of the dial. Always renders MM:SS so the user sees the
/// exact countdown rather than a rounded minute label, and so the visual
/// rhythm of the seconds ticking is part of the focus aesthetic.
class AnimatedMinuteText extends StatelessWidget {
  const AnimatedMinuteText({required this.remaining, super.key});

  final Duration remaining;

  String get _displayText {
    final clamped = remaining.isNegative ? Duration.zero : remaining;
    final minutes = clamped.inMinutes.toString().padLeft(2, '0');
    final seconds = (clamped.inSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = _displayText;

    return AnimatedSwitcher(
      duration: MotionDurations.digitSlide,
      transitionBuilder:
          (child, animation) => SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.2),
              end: Offset.zero,
            ).animate(animation),
            child: FadeTransition(opacity: animation, child: child),
          ),
      child: Text(
        text,
        key: ValueKey(text),
        style: TextStyle(
          fontSize: ThemeTokens.typeMinutesSmall,
          fontWeight: FontWeight.w300,
          color: theme.colorScheme.onSurface,
          height: 1,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}
