import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/theme/theme_controller.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/timer/session_config.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/screens/about_screen.dart';

bool get _isDesktop =>
    !kIsWeb && (Platform.isLinux || Platform.isMacOS || Platform.isWindows);

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  SessionConfig? _config;
  int? _dailyGoal;
  bool? _alwaysOnTop;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(settingsRepositoryProvider);
    final cfg = await repo.loadSessionConfig();
    final goal = await repo.loadDailyGoalMinutes();
    final aot = await repo.loadAlwaysOnTop();
    if (!mounted) return;
    setState(() {
      _config = cfg;
      _dailyGoal = goal;
      _alwaysOnTop = aot;
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
    setState(() => _alwaysOnTop = value);
    await ref.read(settingsRepositoryProvider).saveAlwaysOnTop(value: value);
    await ref.read(windowControllerProvider).setAlwaysOnTop(value: value);
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final cfg = _config;
    final goal = _dailyGoal;
    final aot = _alwaysOnTop;
    final themeId = ref.watch(themeControllerProvider);

    if (cfg == null || goal == null || aot == null) {
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
