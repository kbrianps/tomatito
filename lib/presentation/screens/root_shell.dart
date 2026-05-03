import 'package:flutter/material.dart';

import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/screens/settings_screen.dart';
import 'package:tomatito/presentation/screens/statistics_screen.dart';
import 'package:tomatito/presentation/screens/timer_screen.dart';

class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;

  static const _screens = [TimerScreen(), StatisticsScreen(), SettingsScreen()];

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final isWide = MediaQuery.sizeOf(context).width >= 720;
    final destinations = [
      _Dest(Icons.timer_outlined, Icons.timer, loc.navTimer),
      _Dest(Icons.bar_chart_outlined, Icons.bar_chart, loc.navStats),
      _Dest(Icons.settings_outlined, Icons.settings, loc.navSettings),
    ];

    if (isWide) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
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
            Expanded(child: _screens[_index]),
          ],
        ),
      );
    }

    return Scaffold(
      body: _screens[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
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
