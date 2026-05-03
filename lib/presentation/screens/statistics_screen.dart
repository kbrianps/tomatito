import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/data/statistics_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';

class StatisticsScreen extends ConsumerStatefulWidget {
  const StatisticsScreen({super.key});

  @override
  ConsumerState<StatisticsScreen> createState() => _StatisticsScreenState();
}

class _StatisticsScreenState extends ConsumerState<StatisticsScreen> {
  List<DailyMinutes>? _week;
  int _todayMinutes = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(statisticsRepositoryProvider);
    final today = DateTime.now();
    final from = today.subtract(const Duration(days: 6));
    final week = await repo.minutesFocusedInRange(
      fromLocalDay: from,
      toLocalDay: today,
    );
    final todayMins = await repo.minutesFocusedOn(today);
    if (!mounted) return;
    setState(() {
      _week = week;
      _todayMinutes = todayMins;
    });
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final week = _week;

    if (week == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (week.every((d) => d.minutes == 0) && _todayMinutes == 0) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(ThemeTokens.space6),
          child: Text(
            loc.statsEmpty,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(ThemeTokens.space5),
      children: [
        _StatCard(
          label: loc.statsToday,
          value: loc.minutesValue(_todayMinutes),
        ),
        const SizedBox(height: ThemeTokens.space4),
        _WeeklyBars(loc: loc, data: week),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(ThemeTokens.space4),
        child: Row(
          children: [
            Text(label, style: theme.textTheme.titleMedium),
            const Spacer(),
            Text(value, style: theme.textTheme.headlineSmall),
          ],
        ),
      ),
    );
  }
}

class _WeeklyBars extends StatelessWidget {
  const _WeeklyBars({required this.loc, required this.data});
  final AppLocalizations loc;
  final List<DailyMinutes> data;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final maxMinutes = data
        .map((d) => d.minutes)
        .fold<int>(0, (a, b) => a > b ? a : b)
        .clamp(60, 1 << 30);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(ThemeTokens.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(loc.statsThisWeek, style: theme.textTheme.titleMedium),
            const SizedBox(height: ThemeTokens.space4),
            SizedBox(
              height: 160,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final d in data)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Text(
                              '${d.minutes}',
                              style: theme.textTheme.bodySmall,
                            ),
                            const SizedBox(height: 4),
                            Expanded(
                              child: Align(
                                alignment: Alignment.bottomCenter,
                                child: FractionallySizedBox(
                                  heightFactor: d.minutes / maxMinutes,
                                  widthFactor: 1,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: theme.colorScheme.primary,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _dayLabel(d.day),
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _dayLabel(DateTime day) {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return labels[day.weekday - 1];
  }
}
