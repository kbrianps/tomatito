import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/window/window_state.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/screens/settings_screen.dart';
import 'package:tomatito/presentation/screens/statistics_screen.dart';
import 'package:tomatito/presentation/screens/timer_screen.dart';

/// Currently selected bottom-nav / rail index. Exposed via a provider so
/// keyboard shortcuts (Ctrl+, jumps to Settings) can navigate without
/// reaching into RootShell's local state.
final navigationIndexProvider = StateProvider<int>((ref) => 0);

class RootShell extends ConsumerWidget {
  const RootShell({super.key});

  static const _screens = [TimerScreen(), StatisticsScreen(), SettingsScreen()];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = AppLocalizations.of(context);
    final isWide = MediaQuery.sizeOf(context).width >= 720;
    final compact = ref.watch(compactModeProvider);
    final indexRaw = ref.watch(navigationIndexProvider);
    // Compact mode is timer-only: rail and bottom nav are hidden so the
    // 280-wide window has room for the dial. Force the Timer view.
    final index = compact ? 0 : indexRaw;
    final destinations = [
      _Dest(Icons.timer_outlined, Icons.timer, loc.navTimer),
      _Dest(Icons.bar_chart_outlined, Icons.bar_chart, loc.navStats),
      _Dest(Icons.settings_outlined, Icons.settings, loc.navSettings),
    ];

    void onTap(int i) => ref.read(navigationIndexProvider.notifier).state = i;

    if (compact) {
      return Scaffold(body: _screens[index]);
    }

    if (isWide) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: index,
              onDestinationSelected: onTap,
              labelType: NavigationRailLabelType.all,
              destinations: [
                for (final d in destinations)
                  NavigationRailDestination(
                    icon: Icon(d.icon),
                    selectedIcon: Icon(d.selectedIcon),
                    label: Text(d.label),
                  ),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(child: _screens[index]),
          ],
        ),
      );
    }

    return Scaffold(
      body: _screens[index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: onTap,
        destinations: [
          for (final d in destinations)
            NavigationDestination(
              icon: Icon(d.icon),
              selectedIcon: Icon(d.selectedIcon),
              label: d.label,
            ),
        ],
      ),
    );
  }
}

class _Dest {
  const _Dest(this.icon, this.selectedIcon, this.label);
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}
