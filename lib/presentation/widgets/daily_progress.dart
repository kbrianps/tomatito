import 'package:flutter/material.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/l10n/app_localizations.dart';

/// Small ring + label showing minutes-focused-today against the daily goal.
class DailyProgress extends StatelessWidget {
  const DailyProgress({
    required this.minutesFocused,
    required this.goalMinutes,
    super.key,
  });

  final int minutesFocused;
  final int goalMinutes;

  double get _ratio =>
      goalMinutes == 0 ? 0 : (minutesFocused / goalMinutes).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final loc = AppLocalizations.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(
            value: _ratio,
            strokeWidth: ThemeTokens.strokeRing,
            backgroundColor: scheme.onSurface.withValues(alpha: 0.1),
            valueColor: AlwaysStoppedAnimation<Color>(scheme.primary),
          ),
        ),
        const SizedBox(width: ThemeTokens.space2),
        Text(
          loc.dailyGoalProgress(minutesFocused, goalMinutes),
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}
