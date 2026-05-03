import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/dial/dial_style.dart';
import 'package:tomatito/core/locale/locale_choice.dart';
import 'package:tomatito/core/sound/sound_bank.dart';
import 'package:tomatito/core/sound/sound_player.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/theme/theme_controller.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/timer/timer_engine.dart';
import 'package:tomatito/core/timer/timer_state.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/core/window/window_state.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/main.dart' show autostartManagerProvider;
import 'package:tomatito/presentation/screens/about_screen.dart';

bool get _isDesktop =>
    !kIsWeb && (Platform.isLinux || Platform.isMacOS || Platform.isWindows);
bool get _isAndroid => !kIsWeb && Platform.isAndroid;

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  SessionConfig? _config;
  int? _dailyGoal;
  String? _chimeId;
  double? _chimeVolume;
  bool? _persistentNotification;
  bool? _tickEnabled;
  bool? _autostart;
  // Tri-state: null = ask each time, true = tray, false = taskbar.
  // Wrapped in a single field with a sentinel because Dart doesn't have
  // option types and we want to distinguish "loaded null" from "not yet
  // loaded".
  bool? _minimizeToTray;
  bool _minimizeLoaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(settingsRepositoryProvider);
    final cfg = await repo.loadSessionConfig();
    final goal = await repo.loadDailyGoalMinutes();
    final chime = await repo.loadChimeId();
    final volume = await repo.loadChimeVolume();
    final persistent = await repo.loadPersistentNotification();
    final tick = await repo.loadTickEnabled();
    final autostart = await repo.loadAutostart();
    final minimize = await repo.loadMinimizeToTray();
    if (!mounted) return;
    setState(() {
      _config = cfg;
      _dailyGoal = goal;
      _chimeId = chime;
      _chimeVolume = volume;
      _persistentNotification = persistent;
      _tickEnabled = tick;
      _autostart = autostart;
      _minimizeToTray = minimize;
      _minimizeLoaded = true;
    });
  }

  Future<void> _updateConfig(SessionConfig newConfig) async {
    final oldConfig = _config;
    setState(() => _config = newConfig);
    await ref.read(settingsRepositoryProvider).saveSessionConfig(newConfig);
    if (!mounted) return;
    final engine = ref.read(timerEngineProvider);
    final state = engine.current;
    final isMid = state is TimerRunning || state is TimerPaused;
    final durationChanged =
        oldConfig != null &&
        (oldConfig.focus != newConfig.focus ||
            oldConfig.shortBreak != newConfig.shortBreak ||
            oldConfig.longBreak != newConfig.longBreak);
    if (!isMid || !durationChanged) {
      engine.updateConfig(newConfig);
      return;
    }
    final loc = AppLocalizations.of(context);
    final applyNow = await showDialog<bool>(
      context: context,
      builder:
          (ctx) => AlertDialog(
            title: Text(loc.applyNowDialogTitle),
            content: Text(loc.applyNowDialogBody),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: Text(loc.applyNowDialogNext),
              ),
              FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: Text(loc.applyNowDialogNow),
              ),
            ],
          ),
    );
    engine.updateConfig(newConfig, applyToCurrent: applyNow ?? false);
  }

  void _updateGoal(int minutes) {
    setState(() => _dailyGoal = minutes);
    ref.read(settingsRepositoryProvider).saveDailyGoalMinutes(minutes);
  }

  Future<void> _updateAlwaysOnTop({required bool value}) async {
    ref.read(alwaysOnTopProvider.notifier).state = value;
    await ref.read(settingsRepositoryProvider).saveAlwaysOnTop(value: value);
    await ref.read(windowControllerProvider).setAlwaysOnTop(value: value);
  }

  void _updateChimeId(String id) {
    setState(() => _chimeId = id);
    ref.read(settingsRepositoryProvider).saveChimeId(id);
  }

  void _updateChimeVolume(double volume) {
    setState(() => _chimeVolume = volume);
    ref.read(settingsRepositoryProvider).saveChimeVolume(volume);
  }

  void _updatePersistentNotification({required bool value}) {
    setState(() => _persistentNotification = value);
    ref
        .read(settingsRepositoryProvider)
        .savePersistentNotification(value: value);
  }

  void _updateTickEnabled({required bool value}) {
    setState(() => _tickEnabled = value);
    ref.read(settingsRepositoryProvider).saveTickEnabled(value: value);
  }

  Future<void> _updateAutostart({required bool value}) async {
    setState(() => _autostart = value);
    final repo = ref.read(settingsRepositoryProvider);
    await repo.saveAutostart(value: value);
    final autostart = ref.read(autostartManagerProvider);
    if (value) {
      await autostart.enable();
    } else {
      await autostart.disable();
    }
  }

  Future<void> _updateMinimize(bool? value) async {
    setState(() => _minimizeToTray = value);
    await ref
        .read(settingsRepositoryProvider)
        .saveMinimizeToTray(value: value);
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final cfg = _config;
    final goal = _dailyGoal;
    final aot = ref.watch(alwaysOnTopProvider);
    final chime = _chimeId;
    final volume = _chimeVolume;
    final persistent = _persistentNotification;
    final tick = _tickEnabled;
    final themeId = ref.watch(themeControllerProvider);

    if (cfg == null ||
        goal == null ||
        chime == null ||
        volume == null ||
        persistent == null ||
        tick == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.symmetric(vertical: ThemeTokens.space3),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            ThemeTokens.space5,
            ThemeTokens.space2,
            ThemeTokens.space5,
            ThemeTokens.space3,
          ),
          child: Text(
            loc.navSettings,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
        ),
        _Section(loc.settingsTimer, [
          _DurationRow(
            label: loc.settingsFocusDuration,
            duration: cfg.focus,
            min: 5,
            max: 120,
            step: 5,
            onChanged: (d) => _updateConfig(cfg.copyWith(focus: d)),
          ),
          _DurationRow(
            label: loc.settingsShortBreakDuration,
            duration: cfg.shortBreak,
            min: 1,
            max: 30,
            step: 1,
            onChanged: (d) => _updateConfig(cfg.copyWith(shortBreak: d)),
          ),
          _DurationRow(
            label: loc.settingsLongBreakDuration,
            duration: cfg.longBreak,
            min: 5,
            max: 60,
            step: 5,
            onChanged: (d) => _updateConfig(cfg.copyWith(longBreak: d)),
          ),
          _IntRow(
            label: loc.settingsCyclesBeforeLongBreak,
            value: cfg.cyclesBeforeLongBreak,
            min: 2,
            max: 8,
            onChanged:
                (v) => _updateConfig(cfg.copyWith(cyclesBeforeLongBreak: v)),
          ),
          SwitchListTile(
            title: Text(loc.settingsAutoStartBreaks),
            value: cfg.autoStartBreaks,
            onChanged: (v) => _updateConfig(cfg.copyWith(autoStartBreaks: v)),
          ),
          SwitchListTile(
            title: Text(loc.settingsAutoStartFocus),
            value: cfg.autoStartFocus,
            onChanged: (v) => _updateConfig(cfg.copyWith(autoStartFocus: v)),
          ),
          SwitchListTile(
            title: Text(loc.settingsStrictMode),
            value: cfg.strictMode,
            onChanged: (v) => _updateConfig(cfg.copyWith(strictMode: v)),
          ),
        ]),
        _Section(loc.settingsGoal, [
          _IntRow(
            label: loc.settingsDailyGoal,
            value: goal,
            min: 30,
            max: 480,
            step: 30,
            valueFormatter: loc.minutesValue,
            onChanged: _updateGoal,
          ),
        ]),
        _Section(loc.settingsSound, [
          ListTile(
            title: Text(loc.settingsChime),
            subtitle: RadioGroup<String>(
              groupValue: chime,
              onChanged: (v) {
                if (v != null) _updateChimeId(v);
              },
              child: Column(
                children: [
                  for (final option in SoundBank.all)
                    RadioListTile<String>(
                      title: Text(_chimeLabel(loc, option)),
                      value: option.id,
                      dense: true,
                      secondary: IconButton(
                        tooltip: loc.soundPreview,
                        icon: const Icon(Icons.play_arrow_outlined),
                        onPressed:
                            () => ref
                                .read(soundPlayerProvider)
                                .play(option, volume: volume),
                      ),
                    ),
                ],
              ),
            ),
          ),
          _VolumeRow(
            label: loc.settingsVolume,
            value: volume,
            onChanged: _updateChimeVolume,
          ),
          SwitchListTile(
            title: Text(loc.settingsTick),
            subtitle: Text(loc.settingsTickSubtitle),
            value: tick,
            onChanged: (v) => _updateTickEnabled(value: v),
          ),
        ]),
        _Section(loc.settingsAppearance, [
          RadioGroup<AppThemeId>(
            groupValue: themeId,
            onChanged: (v) {
              if (v != null) {
                ref.read(themeControllerProvider.notifier).setTheme(v);
              }
            },
            child: Column(
              children: [
                for (final id in AppThemeId.values)
                  RadioListTile<AppThemeId>(
                    title: Text(_themeLabel(loc, id)),
                    value: id,
                  ),
              ],
            ),
          ),
        ]),
        _Section(loc.settingsDial, [
          RadioGroup<DialStyle>(
            groupValue: ref.watch(dialStyleProvider),
            onChanged: (v) {
              if (v == null) return;
              ref.read(dialStyleProvider.notifier).state = v;
              ref.read(settingsRepositoryProvider).saveDialStyle(v);
            },
            child: Column(
              children: [
                for (final s in DialStyle.values)
                  RadioListTile<DialStyle>(
                    title: Text(_dialStyleLabel(loc, s)),
                    value: s,
                  ),
              ],
            ),
          ),
        ]),
        _Section(loc.settingsLanguage, [
          RadioGroup<LocaleChoice>(
            groupValue: ref.watch(localeChoiceProvider),
            onChanged: (v) {
              if (v == null) return;
              ref.read(localeChoiceProvider.notifier).state = v;
              ref.read(settingsRepositoryProvider).saveLocaleChoice(v);
            },
            child: Column(
              children: [
                for (final c in LocaleChoice.values)
                  RadioListTile<LocaleChoice>(
                    title: Text(_localeLabel(loc, c)),
                    value: c,
                  ),
              ],
            ),
          ),
        ]),
        if (_isDesktop)
          _Section(loc.settingsWindow, [
            SwitchListTile(
              title: Text(loc.settingsAlwaysOnTop),
              value: aot,
              onChanged: (v) => _updateAlwaysOnTop(value: v),
            ),
            SwitchListTile(
              title: Text(loc.settingsAutostart),
              subtitle: Text(loc.settingsAutostartSubtitle),
              value: _autostart ?? false,
              onChanged: _autostart == null
                  ? null
                  : (v) => _updateAutostart(value: v),
            ),
            if (_minimizeLoaded)
              ListTile(
                title: Text(loc.settingsMinimize),
                subtitle: Text(_minimizeLabel(loc, _minimizeToTray)),
                trailing: const Icon(Icons.chevron_right),
                onTap: _showMinimizePicker,
              ),
          ]),
        if (_isAndroid)
          _Section(loc.settingsNotifications, [
            SwitchListTile(
              title: Text(loc.settingsPersistentNotification),
              subtitle: Text(loc.settingsPersistentNotificationSubtitle),
              value: persistent,
              onChanged: (v) => _updatePersistentNotification(value: v),
            ),
          ]),
        _Section(loc.settingsAbout, [
          ListTile(
            title: Text(loc.settingsAbout),
            trailing: const Icon(Icons.chevron_right),
            onTap:
                () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const AboutScreen()),
                ),
          ),
        ]),
      ],
    );
  }

  String _themeLabel(AppLocalizations loc, AppThemeId id) {
    switch (id) {
      case AppThemeId.light:
        return loc.themeLight;
      case AppThemeId.dark:
        return loc.themeDark;
      case AppThemeId.blackOled:
        return loc.themeBlackOled;
      case AppThemeId.tomatito:
        return loc.themeTomatito;
      case AppThemeId.system:
        return loc.themeSystem;
    }
  }

  String _localeLabel(AppLocalizations loc, LocaleChoice choice) {
    switch (choice) {
      case LocaleChoice.system:
        return loc.languageSystem;
      case LocaleChoice.en:
        return loc.languageEnglish;
      case LocaleChoice.pt:
        return loc.languagePortuguese;
    }
  }

  String _chimeLabel(AppLocalizations loc, SoundOption option) {
    switch (option.id) {
      case 'soft_bell':
        return loc.soundSoftBell;
      case 'wood_block':
        return loc.soundWoodBlock;
      case 'gentle_pulse':
        return loc.soundGentlePulse;
      default:
        return option.id;
    }
  }

  String _dialStyleLabel(AppLocalizations loc, DialStyle style) {
    switch (style) {
      case DialStyle.ticks:
        return loc.dialStyleTicks;
      case DialStyle.arc:
        return loc.dialStyleArc;
    }
  }

  String _minimizeLabel(AppLocalizations loc, bool? value) {
    if (value == null) return loc.settingsMinimizeAsk;
    return value ? loc.settingsMinimizeTray : loc.settingsMinimizeTaskbar;
  }

  Future<void> _showMinimizePicker() async {
    final loc = AppLocalizations.of(context);
    final picked = await showModalBottomSheet<_MinimizeChoice>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.help_outline),
              title: Text(loc.settingsMinimizeAsk),
              onTap: () => Navigator.of(ctx).pop(_MinimizeChoice.ask),
            ),
            ListTile(
              leading: const Icon(Icons.tab_unselected),
              title: Text(loc.settingsMinimizeTray),
              onTap: () => Navigator.of(ctx).pop(_MinimizeChoice.tray),
            ),
            ListTile(
              leading: const Icon(Icons.minimize),
              title: Text(loc.settingsMinimizeTaskbar),
              onTap: () => Navigator.of(ctx).pop(_MinimizeChoice.taskbar),
            ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    await _updateMinimize(switch (picked) {
      _MinimizeChoice.ask => null,
      _MinimizeChoice.tray => true,
      _MinimizeChoice.taskbar => false,
    });
  }
}

enum _MinimizeChoice { ask, tray, taskbar }

class _Section extends StatelessWidget {
  const _Section(this.title, this.children);
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            ThemeTokens.space4,
            ThemeTokens.space4,
            ThemeTokens.space4,
            ThemeTokens.space2,
          ),
          child: Text(
            title,
            style: theme.textTheme.titleSmall?.copyWith(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        ...children,
        const SizedBox(height: ThemeTokens.space2),
      ],
    );
  }
}

/// Drag previews live; the parent only learns about the new value when
/// the user releases the slider, so the apply-now dialog does not pop
/// on every mid-drag tick.
class _DurationRow extends StatefulWidget {
  const _DurationRow({
    required this.label,
    required this.duration,
    required this.min,
    required this.max,
    required this.step,
    required this.onChanged,
  });

  final String label;
  final Duration duration;
  final int min;
  final int max;
  final int step;
  final ValueChanged<Duration> onChanged;

  @override
  State<_DurationRow> createState() => _DurationRowState();
}

class _DurationRowState extends State<_DurationRow> {
  late double _liveMinutes = widget.duration.inMinutes.toDouble();

  @override
  void didUpdateWidget(covariant _DurationRow old) {
    super.didUpdateWidget(old);
    if (old.duration.inMinutes != widget.duration.inMinutes) {
      _liveMinutes = widget.duration.inMinutes.toDouble();
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final minutes = _liveMinutes.round();
    return ListTile(
      title: Text(widget.label),
      subtitle: Slider(
        value: _liveMinutes.clamp(widget.min.toDouble(), widget.max.toDouble()),
        min: widget.min.toDouble(),
        max: widget.max.toDouble(),
        divisions: (widget.max - widget.min) ~/ widget.step,
        label: loc.minutesValue(minutes),
        onChanged: (v) => setState(() => _liveMinutes = v),
        onChangeEnd: (v) => widget.onChanged(Duration(minutes: v.round())),
      ),
      trailing: Text(loc.minutesValue(minutes)),
    );
  }
}

class _IntRow extends StatefulWidget {
  const _IntRow({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.step = 1,
    this.valueFormatter,
  });

  final String label;
  final int value;
  final int min;
  final int max;
  final int step;
  final String Function(int)? valueFormatter;
  final ValueChanged<int> onChanged;

  @override
  State<_IntRow> createState() => _IntRowState();
}

class _IntRowState extends State<_IntRow> {
  late double _live = widget.value.toDouble();

  @override
  void didUpdateWidget(covariant _IntRow old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value) {
      _live = widget.value.toDouble();
    }
  }

  @override
  Widget build(BuildContext context) {
    final shown = _live.round();
    final formatted = widget.valueFormatter?.call(shown) ?? shown.toString();
    return ListTile(
      title: Text(widget.label),
      subtitle: Slider(
        value: _live.clamp(widget.min.toDouble(), widget.max.toDouble()),
        min: widget.min.toDouble(),
        max: widget.max.toDouble(),
        divisions: (widget.max - widget.min) ~/ widget.step,
        label: formatted,
        onChanged: (v) => setState(() => _live = v),
        onChangeEnd: (v) => widget.onChanged(v.round()),
      ),
      trailing: Text(formatted),
    );
  }
}

class _VolumeRow extends StatelessWidget {
  const _VolumeRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final percent = (value * 100).round();
    return ListTile(
      title: Text(label),
      subtitle: Slider(
        value: value.clamp(0.0, 1.0),
        divisions: 20,
        label: '$percent%',
        onChanged: onChanged,
      ),
      trailing: Text('$percent%'),
    );
  }
}
