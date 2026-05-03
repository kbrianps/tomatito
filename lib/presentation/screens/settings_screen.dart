import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/sound/sound_bank.dart';
import 'package:tomatito/core/sound/sound_player.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/theme/theme_controller.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/core/window/window_state.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
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
    if (!mounted) return;
    setState(() {
      _config = cfg;
      _dailyGoal = goal;
      _chimeId = chime;
      _chimeVolume = volume;
      _persistentNotification = persistent;
      _tickEnabled = tick;
    });
  }

  void _updateConfig(SessionConfig newConfig) {
    setState(() => _config = newConfig);
    ref.read(settingsRepositoryProvider).saveSessionConfig(newConfig);
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
        if (_isDesktop)
          _Section(loc.settingsWindow, [
            SwitchListTile(
              title: Text(loc.settingsAlwaysOnTop),
              value: aot,
              onChanged: (v) => _updateAlwaysOnTop(value: v),
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
}

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

class _DurationRow extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final minutes = duration.inMinutes;
    return ListTile(
      title: Text(label),
      subtitle: Slider(
        value: minutes.toDouble().clamp(min.toDouble(), max.toDouble()),
        min: min.toDouble(),
        max: max.toDouble(),
        divisions: (max - min) ~/ step,
        label: loc.minutesValue(minutes),
        onChanged: (v) => onChanged(Duration(minutes: v.round())),
      ),
      trailing: Text(loc.minutesValue(minutes)),
    );
  }
}

class _IntRow extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final formatted = valueFormatter?.call(value) ?? value.toString();
    return ListTile(
      title: Text(label),
      subtitle: Slider(
        value: value.toDouble().clamp(min.toDouble(), max.toDouble()),
        min: min.toDouble(),
        max: max.toDouble(),
        divisions: (max - min) ~/ step,
        label: formatted,
        onChanged: (v) => onChanged(v.round()),
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
