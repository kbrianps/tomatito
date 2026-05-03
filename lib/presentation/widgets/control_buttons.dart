import 'package:flutter/material.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/l10n/app_localizations.dart';

class ControlButtons extends StatelessWidget {
  const ControlButtons({
    required this.state,
    required this.onPlayPause,
    required this.onReset,
    this.onMore,
    super.key,
  });

  final TimerState state;
  final VoidCallback onPlayPause;
  final VoidCallback onReset;
  final VoidCallback? onMore;

  bool get _isPlaying => state is TimerRunning;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final loc = AppLocalizations.of(context);

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton.outlined(
          tooltip: loc.reset,
          onPressed: onReset,
          icon: const Icon(Icons.refresh),
        ),
        const SizedBox(width: ThemeTokens.space5),
        SizedBox(
          width: ThemeTokens.minTapTarget,
          height: ThemeTokens.minTapTarget,
          child: FilledButton(
            onPressed: onPlayPause,
            style: FilledButton.styleFrom(
              backgroundColor: scheme.primary,
              foregroundColor: scheme.onPrimary,
              shape: const CircleBorder(),
              padding: EdgeInsets.zero,
            ),
            child: Icon(_isPlaying ? Icons.pause : Icons.play_arrow),
          ),
        ),
        const SizedBox(width: ThemeTokens.space5),
        IconButton(
          tooltip: loc.more,
          onPressed: onMore,
          icon: const Icon(Icons.more_horiz),
        ),
      ],
    );
  }
}
