import 'dart:io' show Platform;

import 'package:android_intent_plus/android_intent.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tomatito/core/bootstrap_result.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/theme/theme_controller.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/core/window/window_state.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/widgets/control_buttons.dart';
import 'package:tomatito/presentation/widgets/timer_dial.dart';
import 'package:window_manager/window_manager.dart';

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
    final themeId = ref.watch(themeControllerProvider);
    // Shape theme only kicks in inside compact mode; the normal-sized
    // window keeps the regular Card-based layout. Outside compact, the
    // shape scheme is identical to the regular tomatito red.
    final isShape = themeId == AppThemeId.tomatitoShape && compact;
    return StreamBuilder<TimerState>(
      stream: engine.stream,
      initialData: engine.current,
      builder: (context, snapshot) {
        final state = snapshot.data ?? const TimerIdle();
        if (isShape) {
          return _ShapedTimerView(
            state: state,
            engine: engine,
            ref: ref,
            idleConfig: _idleConfig,
          );
        }
        return SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Padding(
                padding: EdgeInsets.all(
                  compact ? ThemeTokens.space1 : ThemeTokens.space4,
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

/// Shape mode: the entire compact window IS the bundled tomato PNG; the
/// dial + control buttons sit centred over the body of the tomato. The
/// title bar is still drawn above (so the user can pin / resize / close
/// / leave compact); Linux runner already ships a transparent visual so
/// the area outside the PNG stays see-through.
class _ShapedTimerView extends StatelessWidget {
  const _ShapedTimerView({
    required this.state,
    required this.engine,
    required this.ref,
    required this.idleConfig,
  });

  final TimerState state;
  final TimerEngine engine;
  final WidgetRef ref;
  final SessionConfig? idleConfig;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.transparent,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // The whole window drags from anywhere on the tomato. PNG sits
          // below the drag layer; pointer events on the PNG bubble up to
          // DragToMoveArea, but tap targets above (caption row + dial +
          // controls) are added later in the Stack so they win hit-test.
          DragToMoveArea(
            child: Image.asset(
              'assets/themes/tomatito_window.png',
              fit: BoxFit.contain,
            ),
          ),
          // Dial + controls centred on the body, slightly below the
          // geometric centre to clear the stem.
          Align(
            alignment: const Alignment(0, 0.12),
            child: LayoutBuilder(
              builder: (ctx, c) {
                final dialSize = c.maxWidth * 0.32;
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TimerDial(
                      state: state,
                      size: dialSize,
                      idleConfig: idleConfig,
                    ),
                    const SizedBox(height: ThemeTokens.space1),
                    Transform.scale(
                      scale: 0.7,
                      child: ControlButtons(
                        state: state,
                        onPlayPause: _togglePlayPause,
                        onReset: engine.reset,
                        onSkip: _onSkip,
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          // Mini caption cluster at the top, sitting just under the
          // stem so it stays inside the tomato silhouette.
          const Align(
            alignment: Alignment(0, -0.62),
            child: _ShapeCaptionRow(),
          ),
        ],
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
      final config =
          await ref.read(settingsRepositoryProvider).loadSessionConfig();
      engine.start(config);
    }
    engine.skip();
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
    final cardPadding = compact ? ThemeTokens.space2 : ThemeTokens.space5;
    // Compact has to leave vertical room for the controls + dots in the
    // 320 dp window. 0.7 keeps the dial visible without crowding the
    // buttons; the font scaler caps at 36 px so the digits stay legible.
    final dialFraction = compact ? 0.7 : 0.85;
    return Card(
      child: Padding(
        padding: EdgeInsets.all(cardPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Hide the period header entirely in compact mode: the dots
            // below the controls already convey the cycle, and the small
            // window has no vertical room to spare.
            if (!compact) ...[
              _Header(state: state, idleConfig: idleConfig, compact: false),
              const SizedBox(height: ThemeTokens.space5),
            ],
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
            // Compact mode shows nothing below the controls: no dot row,
            // no status caption, no trailing spacer. Keeps the 240x320
            // window from wasting any pixel below the buttons.
            if (!compact) ...[
              const SizedBox(height: ThemeTokens.space3),
              _SessionProgressDots(state: state, idleConfig: idleConfig),
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

enum _SlotStatus { done, current, future }

class _Slot {
  const _Slot(this.kind, this.status);
  final PeriodKind kind;
  final _SlotStatus status;
}

/// Renders one dot per period slot in the full session (focus + short
/// breaks + final long break). For a 4-cycle config that is 4 + 3 + 1 = 8
/// dots. Focus dots are larger and primary-coloured; break dots are
/// smaller and tertiary-coloured so the user reads "the big ones are
/// what counts".
class _SessionProgressDots extends StatelessWidget {
  const _SessionProgressDots({required this.state, required this.idleConfig});

  final TimerState state;
  final SessionConfig? idleConfig;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final slots = _buildSlots();
    if (slots.isEmpty) return const SizedBox.shrink();

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < slots.length; i++) ...[
          if (i > 0) const SizedBox(width: 5),
          _ProgressDot(
            slot: slots[i],
            scheme: scheme,
          ),
        ],
      ],
    );
  }

  List<_Slot> _buildSlots() {
    final s = state;
    int totalCycles;
    int currentCycle;
    PeriodKind? currentKind;

    if (s is TimerRunning) {
      totalCycles = s.totalCycles;
      currentCycle = s.cycle;
      currentKind = s.kind;
    } else if (s is TimerPaused) {
      totalCycles = s.totalCycles;
      currentCycle = s.cycle;
      currentKind = s.kind;
    } else if (idleConfig != null) {
      totalCycles = idleConfig!.cyclesBeforeLongBreak;
      currentCycle = 1;
      currentKind = null;
    } else {
      return const [];
    }

    final slots = <_Slot>[];
    for (var i = 1; i <= totalCycles; i++) {
      slots.add(_Slot(PeriodKind.focus,
          _focusStatus(i, currentCycle, currentKind)));
      if (i < totalCycles) {
        slots.add(_Slot(PeriodKind.shortBreak,
            _shortBreakStatus(i, currentCycle, currentKind)));
      }
    }
    slots.add(_Slot(PeriodKind.longBreak, _longBreakStatus(currentKind)));
    return slots;
  }

  // Focus i is past once we're on a later cycle, or on the same cycle
  // but no longer on focus (we already moved into the break that follows).
  _SlotStatus _focusStatus(int i, int currentCycle, PeriodKind? currentKind) {
    if (currentKind == null) return _SlotStatus.future;
    if (currentCycle > i) return _SlotStatus.done;
    if (currentCycle == i) {
      return currentKind == PeriodKind.focus
          ? _SlotStatus.current
          : _SlotStatus.done;
    }
    return _SlotStatus.future;
  }

  // The j-th short break sits between focus j and focus j+1. The engine
  // increments cycle when the break finishes, so the break is done once
  // currentCycle > j.
  _SlotStatus _shortBreakStatus(
    int j,
    int currentCycle,
    PeriodKind? currentKind,
  ) {
    if (currentKind == null) return _SlotStatus.future;
    if (currentCycle > j) return _SlotStatus.done;
    if (currentCycle == j && currentKind == PeriodKind.shortBreak) {
      return _SlotStatus.current;
    }
    return _SlotStatus.future;
  }

  // Long break is the last slot. It is current when the engine is on it
  // and never marked done (the engine returns to idle right after, which
  // we render as a fresh session for the next round).
  _SlotStatus _longBreakStatus(PeriodKind? currentKind) {
    if (currentKind == PeriodKind.longBreak) return _SlotStatus.current;
    return _SlotStatus.future;
  }
}

class _ProgressDot extends StatelessWidget {
  const _ProgressDot({required this.slot, required this.scheme});

  final _Slot slot;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final isFocus = slot.kind == PeriodKind.focus;
    final color = switch (slot.kind) {
      PeriodKind.focus => scheme.primary,
      PeriodKind.shortBreak => scheme.tertiary,
      PeriodKind.longBreak => scheme.secondary,
    };
    final inactive = scheme.onSurface.withValues(alpha: 0.18);
    final baseSize = isFocus ? 8.0 : 5.0;
    final size = slot.status == _SlotStatus.current ? baseSize + 2 : baseSize;
    final filled =
        slot.status == _SlotStatus.done || slot.status == _SlotStatus.current;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: filled ? color : Colors.transparent,
        border: filled ? null : Border.all(color: inactive, width: 1.2),
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

/// Mini caption row painted inside the tomato in shape compact mode.
/// Pin / Expand-out-of-compact / Close. Settings + minimize are
/// intentionally dropped: the tomato is a focused micro-dock, the
/// expand button sends the user back to the regular layout where the
/// full title bar (with everything) reappears.
class _ShapeCaptionRow extends ConsumerWidget {
  const _ShapeCaptionRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final pinned = ref.watch(alwaysOnTopProvider);
    final iconColor = scheme.onPrimary.withValues(alpha: 0.85);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _MiniCaptionButton(
          icon: pinned ? Icons.push_pin : Icons.push_pin_outlined,
          color: pinned ? scheme.primary : iconColor,
          onTap: () async {
            final next = !pinned;
            ref.read(alwaysOnTopProvider.notifier).state = next;
            await ref
                .read(settingsRepositoryProvider)
                .saveAlwaysOnTop(value: next);
            await ref
                .read(windowControllerProvider)
                .setAlwaysOnTop(value: next);
          },
        ),
        _MiniCaptionButton(
          icon: Icons.open_in_full,
          color: iconColor,
          onTap: () async {
            // Leave compact: revert window size to the remembered one.
            // The same logic lives on the title bar but is unreachable
            // when the title bar is hidden, so duplicate it minimally.
            if (await windowManager.isMaximized()) {
              await windowManager.unmaximize();
            }
            await windowManager.setSize(const Size(420, 720));
            ref.read(compactModeProvider.notifier).state = false;
          },
        ),
        _MiniCaptionButton(
          icon: Icons.close,
          color: iconColor,
          onTap: windowManager.close,
        ),
      ],
    );
  }
}

class _MiniCaptionButton extends StatefulWidget {
  const _MiniCaptionButton({
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  State<_MiniCaptionButton> createState() => _MiniCaptionButtonState();
}

class _MiniCaptionButtonState extends State<_MiniCaptionButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        child: Container(
          width: 22,
          height: 22,
          margin: const EdgeInsets.symmetric(horizontal: 1),
          decoration: BoxDecoration(
            color: _hover
                ? Colors.black.withValues(alpha: 0.18)
                : Colors.transparent,
            shape: BoxShape.circle,
          ),
          child: Icon(widget.icon, size: 13, color: widget.color),
        ),
      ),
    );
  }
}
