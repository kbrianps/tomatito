import 'dart:io' show Platform;

import 'package:android_intent_plus/android_intent.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/bootstrap_result.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/core/window/window_state.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/widgets/control_buttons.dart';
import 'package:tomatito/presentation/widgets/timer_dial.dart';

class TimerScreen extends ConsumerStatefulWidget {
  const TimerScreen({super.key});

  @override
  ConsumerState<TimerScreen> createState() => _TimerScreenState();
}

class _TimerScreenState extends ConsumerState<TimerScreen> {
  bool _bootstrapHandled = false;
  SessionConfig? _idleConfig;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _handleBootstrap();
      await _loadIdleConfig();
    });
  }

  Future<void> _loadIdleConfig() async {
    if (!mounted) return;
    final cfg =
        await ref.read(settingsRepositoryProvider).loadSessionConfig();
    if (!mounted) return;
    setState(() => _idleConfig = cfg);
  }

  Future<void> _handleBootstrap() async {
    if (_bootstrapHandled) return;
    _bootstrapHandled = true;
    final bootstrap = ref.read(bootstrapResultProvider);
    // Resume-from-checkpoint is silent: the engine has already restored
    // the previous period in a paused state, so the user just sees the
    // dial where they left off. The earlier "Resume / Start fresh"
    // dialog was removed because the user always wanted to resume.
    if (bootstrap.shouldShowOemTip) {
      await _showOemTip();
    }
  }

  Future<void> _showOemTip() async {
    if (!mounted) return;
    final loc = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    messenger.showMaterialBanner(
      MaterialBanner(
        content: Text(loc.oemTipBody),
        leading: const Icon(Icons.battery_alert_outlined),
        actions: [
          TextButton(
            onPressed: _openBatterySettings,
            child: Text(loc.oemTipOpenSettings),
          ),
          TextButton(
            onPressed: () async {
              messenger.hideCurrentMaterialBanner();
              await ref
                  .read(settingsRepositoryProvider)
                  .saveOemTipShown(value: true);
            },
            child: Text(loc.oemTipDismiss),
          ),
        ],
      ),
    );
  }

  Future<void> _openBatterySettings() async {
    if (kIsWeb || !Platform.isAndroid) return;
    // Best deep link for the OEM-kill problem: Android's whitelist for
    // battery optimisations. Falls back to the app's general settings
    // page if the device does not handle the optimisation intent.
    try {
      const intent = AndroidIntent(
        action: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
      );
      await intent.launch();
    } on Object {
      const fallback = AndroidIntent(
        action: 'android.settings.APPLICATION_DETAILS_SETTINGS',
        data: 'package:dev.kbrianps.tomatito',
      );
      await fallback.launch();
    }
  }

  @override
  Widget build(BuildContext context) {
    final engine = ref.watch(timerEngineProvider);
    final compact = ref.watch(compactModeProvider);
    return StreamBuilder<TimerState>(
      stream: engine.stream,
      initialData: engine.current,
      builder: (context, snapshot) {
        final state = snapshot.data ?? const TimerIdle();
        return SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Padding(
                padding: EdgeInsets.all(
                  compact ? ThemeTokens.space2 : ThemeTokens.space4,
                ),
                child: _TimerCard(
                  state: state,
                  engine: engine,
                  ref: ref,
                  compact: compact,
                  idleConfig: _idleConfig,
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TimerCard extends StatelessWidget {
  const _TimerCard({
    required this.state,
    required this.engine,
    required this.ref,
    required this.compact,
    required this.idleConfig,
  });

  final TimerState state;
  final TimerEngine engine;
  final WidgetRef ref;
  final bool compact;
  final SessionConfig? idleConfig;

  @override
  Widget build(BuildContext context) {
    final cardPadding = compact ? ThemeTokens.space3 : ThemeTokens.space5;
    final dialFraction = compact ? 0.95 : 0.85;
    return Card(
      child: Padding(
        padding: EdgeInsets.all(cardPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _Header(state: state, idleConfig: idleConfig, compact: compact),
            SizedBox(
              height: compact ? ThemeTokens.space3 : ThemeTokens.space5,
            ),
            LayoutBuilder(
              builder: (ctx, c) {
                final dialSize = c.maxWidth * dialFraction;
                return TimerDial(
                  state: state,
                  size: dialSize,
                  idleConfig: idleConfig,
                );
              },
            ),
            SizedBox(
              height: compact ? ThemeTokens.space3 : ThemeTokens.space5,
            ),
            ControlButtons(
              state: state,
              onPlayPause: _togglePlayPause,
              onReset: engine.reset,
              onSkip: _onSkip,
            ),
            const SizedBox(height: ThemeTokens.space3),
            _SessionProgressDots(state: state, idleConfig: idleConfig),
            if (!compact) ...[
              const SizedBox(height: ThemeTokens.space3),
              _StatusText(state: state),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _togglePlayPause() async {
    final s = state;
    if (s is TimerIdle) {
      final config =
          await ref.read(settingsRepositoryProvider).loadSessionConfig();
      engine.start(config);
    } else if (s is TimerRunning) {
      engine.pause();
    } else if (s is TimerPaused) {
      engine.resume();
    } else if (s is TimerPeriodComplete) {
      engine.skip();
    }
  }

  Future<void> _onSkip() async {
    if (state is TimerIdle) {
      // Skip-from-idle: load the user's config, start the cycle, and
      // immediately skip to the next period. The engine then sits paused
      // at the next period (short break) so the user can press play
      // when they are ready.
      final config =
          await ref.read(settingsRepositoryProvider).loadSessionConfig();
      engine.start(config);
    }
    engine.skip();
  }
}

class _SessionProgressDots extends StatelessWidget {
  const _SessionProgressDots({required this.state, required this.idleConfig});

  final TimerState state;
  final SessionConfig? idleConfig;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = state;

    int total;
    int doneCount;
    int currentIdx;
    bool currentIsFocus;

    if (s is TimerRunning) {
      total = s.totalCycles;
      currentIsFocus = s.kind == PeriodKind.focus;
      doneCount = currentIsFocus ? s.cycle - 1 : s.cycle;
      currentIdx = s.cycle - 1;
    } else if (s is TimerPaused) {
      total = s.totalCycles;
      currentIsFocus = s.kind == PeriodKind.focus;
      doneCount = currentIsFocus ? s.cycle - 1 : s.cycle;
      currentIdx = s.cycle - 1;
    } else if (idleConfig != null) {
      total = idleConfig!.cyclesBeforeLongBreak;
      doneCount = 0;
      currentIdx = 0;
      currentIsFocus = true;
    } else {
      return const SizedBox.shrink();
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < total; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          _ProgressDot(
            filled: i < doneCount,
            current: i == currentIdx && currentIsFocus,
            color: scheme.primary,
            inactiveColor: scheme.onSurface.withValues(alpha: 0.18),
          ),
        ],
      ],
    );
  }
}

class _ProgressDot extends StatelessWidget {
  const _ProgressDot({
    required this.filled,
    required this.current,
    required this.color,
    required this.inactiveColor,
  });

  final bool filled;
  final bool current;
  final Color color;
  final Color inactiveColor;

  @override
  Widget build(BuildContext context) {
    final size = current ? 9.0 : 7.0;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: filled || current ? color : Colors.transparent,
        border: filled || current
            ? null
            : Border.all(color: inactiveColor, width: 1.2),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.state,
    required this.idleConfig,
    required this.compact,
  });
  final TimerState state;
  final SessionConfig? idleConfig;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final s = state;
    String text;
    if (s is TimerRunning) {
      text = _headerFor(loc, s.kind, s.cycle, s.totalCycles);
    } else if (s is TimerPaused) {
      text = _headerFor(loc, s.kind, s.cycle, s.totalCycles);
    } else if (idleConfig != null) {
      // Show the upcoming period title even before the user starts so the
      // header is never blank.
      text =
          loc.focusPeriodOfTotal(1, idleConfig!.cyclesBeforeLongBreak);
    } else {
      text = loc.ready;
    }
    final style = compact
        ? theme.textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w600,
            color: theme.colorScheme.onSurface.withValues(alpha: 0.85),
          )
        : theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w600,
          );
    return Align(
      alignment: compact ? Alignment.center : Alignment.centerLeft,
      child: Text(
        text,
        textAlign: compact ? TextAlign.center : TextAlign.left,
        overflow: TextOverflow.ellipsis,
        maxLines: 1,
        style: style,
      ),
    );
  }

  String _headerFor(
    AppLocalizations loc,
    PeriodKind kind,
    int cycle,
    int totalCycles,
  ) {
    switch (kind) {
      case PeriodKind.focus:
        return loc.focusPeriodOfTotal(cycle, totalCycles);
      case PeriodKind.shortBreak:
        return loc.shortBreak;
      case PeriodKind.longBreak:
        return loc.longBreak;
    }
  }
}

class _StatusText extends StatelessWidget {
  const _StatusText({required this.state});
  final TimerState state;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final s = state;
    String text;
    if (s is TimerRunning) {
      text = _statusFor(loc, s.kind);
    } else if (s is TimerPaused) {
      text = loc.paused;
    } else {
      text = loc.ready;
    }
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      child: Text(
        text,
        key: ValueKey(text),
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
        ),
      ),
    );
  }

  String _statusFor(AppLocalizations loc, PeriodKind kind) {
    switch (kind) {
      case PeriodKind.focus:
        return loc.focusing;
      case PeriodKind.shortBreak:
        return loc.shortBreak;
      case PeriodKind.longBreak:
        return loc.longBreak;
    }
  }
}
