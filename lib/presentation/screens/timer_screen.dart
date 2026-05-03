import 'dart:io' show Platform;

import 'package:android_intent_plus/android_intent.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/bootstrap_result.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/timer/period_kind.dart';
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _handleBootstrap());
  }

  Future<void> _handleBootstrap() async {
    if (_bootstrapHandled) return;
    _bootstrapHandled = true;
    final bootstrap = ref.read(bootstrapResultProvider);
    if (bootstrap.restoredFromCheckpoint) {
      await _showResumeDialog();
    } else if (bootstrap.shouldShowOemTip) {
      await _showOemTip();
    }
  }

  Future<void> _showResumeDialog() async {
    if (!mounted) return;
    final loc = AppLocalizations.of(context);
    final result = await showDialog<bool>(
      context: context,
      builder:
          (ctx) => AlertDialog(
            title: Text(loc.resumeDialogTitle),
            content: Text(loc.resumeDialogBody),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: Text(loc.resumeDialogStartFresh),
              ),
              FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: Text(loc.resumeDialogResume),
              ),
            ],
          ),
    );
    if (result == false && mounted) {
      ref.read(timerEngineProvider).reset();
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
  });

  final TimerState state;
  final TimerEngine engine;
  final WidgetRef ref;
  final bool compact;

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
            if (!compact) ...[
              _Header(state: state),
              const SizedBox(height: ThemeTokens.space5),
            ],
            LayoutBuilder(
              builder: (ctx, c) {
                final dialSize = c.maxWidth * dialFraction;
                return TimerDial(state: state, size: dialSize);
              },
            ),
            SizedBox(
              height: compact ? ThemeTokens.space3 : ThemeTokens.space5,
            ),
            ControlButtons(
              state: state,
              onPlayPause: _togglePlayPause,
              onReset: engine.reset,
              onSkip: engine.skip,
            ),
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
}

class _Header extends StatelessWidget {
  const _Header({required this.state});
  final TimerState state;

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
    } else {
      text = loc.ready;
    }
    return Align(
      alignment: Alignment.centerLeft,
      child: Text(
        text,
        style: theme.textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w600,
        ),
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
