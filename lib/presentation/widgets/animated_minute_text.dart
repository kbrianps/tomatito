import 'package:flutter/material.dart';

import 'package:tomatito/core/motion/motion_durations.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/l10n/app_localizations.dart';

/// Center display of the dial. Shows minutes (rounded up to the next minute)
/// while the period is running; switches to MM:SS in the final minute.
/// Digit changes slide-and-fade per spec.
class AnimatedMinuteText extends StatelessWidget {
  const AnimatedMinuteText({required this.remaining, super.key});

  final Duration remaining;

  bool get _isFinalMinute => remaining.inSeconds < 60;

  String get _displayText {
    if (_isFinalMinute) {
      final s = remaining.inSeconds.clamp(0, 59);
      return '00:${s.toString().padLeft(2, '0')}';
    }
    final minutesShown = (remaining.inSeconds / 60).ceil();
    return '$minutesShown';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context);
    final text = _displayText;

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        AnimatedSwitcher(
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
              fontSize:
                  _isFinalMinute
                      ? ThemeTokens.typeMinutesSmall
                      : ThemeTokens.typeMinutesLarge,
              fontWeight: FontWeight.w300,
              color: theme.colorScheme.onSurface,
              height: 1,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
        if (!_isFinalMinute) ...[
          const SizedBox(width: 6),
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Text(
              loc.minutesShort,
              style: TextStyle(
                fontSize: ThemeTokens.typeMinutesSuffix,
                color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
