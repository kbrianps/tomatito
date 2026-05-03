import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:tomatito/core/statistics/achievement.dart';
import 'package:tomatito/core/statistics/achievement_checker.dart';
import 'package:tomatito/core/statistics/stats_aggregator.dart';
import 'package:tomatito/core/statistics/stats_summary.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/data/statistics_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';

class StatisticsScreen extends ConsumerStatefulWidget {
  const StatisticsScreen({super.key});

  @override
  ConsumerState<StatisticsScreen> createState() => _StatisticsScreenState();
}

class _StatisticsScreenState extends ConsumerState<StatisticsScreen> {
  StatsSummary? _summary;
  List<AchievementProgress> _achievements = const [];
  StreamSubscription<void>? _changesSub;

  @override
  void initState() {
    super.initState();
    _load();
    _changesSub = ref
        .read(statisticsRepositoryProvider)
        .changes
        .listen((_) => _load());
  }

  @override
  void dispose() {
    _changesSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final stats = ref.read(statisticsRepositoryProvider);
    final settings = ref.read(settingsRepositoryProvider);
    final records = await stats.loadAllCompletions();
    final goal = await settings.loadDailyGoalMinutes();
    final summary =
        StatsAggregator(dailyGoalMinutes: goal).summarise(records);
    final achievements =
        const AchievementChecker().evaluate(summary: summary, records: records);
    if (!mounted) return;
    setState(() {
      _summary = summary;
      _achievements = achievements;
    });
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final summary = _summary;

    if (summary == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (!summary.hasAnyData) {
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

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(ThemeTokens.space5),
        children: [
          _ScreenTitle(loc.navStats),
          const SizedBox(height: ThemeTokens.space4),
          _HeroGrid(loc: loc, summary: summary),
          const SizedBox(height: ThemeTokens.space5),
          _WeeklyBars(loc: loc, summary: summary),
          const SizedBox(height: ThemeTokens.space5),
          _DayOfWeekChart(loc: loc, summary: summary),
          const SizedBox(height: ThemeTokens.space5),
          _HourOfDayChart(loc: loc, summary: summary),
          const SizedBox(height: ThemeTokens.space5),
          _AchievementsSection(loc: loc, achievements: _achievements),
        ],
      ),
    );
  }
}

class _HeroGrid extends StatelessWidget {
  const _HeroGrid({required this.loc, required this.summary});

  final AppLocalizations loc;
  final StatsSummary summary;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).toString();
    final dateFormat = DateFormat.yMMMd(locale);
    final hourFormat = DateFormat.j(locale);

    final tiles = <_HeroTile>[
      _HeroTile(
        icon: Icons.today_outlined,
        label: loc.statsToday,
        value: loc.minutesValue(summary.todayMinutes),
      ),
      _HeroTile(
        icon: Icons.calendar_view_week_outlined,
        label: loc.statsThisWeek,
        value: loc.minutesValue(summary.weekMinutes),
      ),
      _HeroTile(
        icon: Icons.local_fire_department_outlined,
        label: loc.statsCurrentStreak,
        value: loc.statsDaysValue(summary.currentStreakDays),
      ),
      _HeroTile(
        icon: Icons.timeline_outlined,
        label: loc.statsLongestStreak,
        value: loc.statsDaysValue(summary.longestStreakDays),
      ),
      _HeroTile(
        icon: Icons.hourglass_bottom_outlined,
        label: loc.statsTotalFocus,
        value: loc.statsHoursValue(
          summary.totalMinutes ~/ 60,
          summary.totalMinutes % 60,
        ),
      ),
      _HeroTile(
        icon: Icons.repeat_outlined,
        label: loc.statsTotalSessions,
        value: '${summary.totalSessions}',
      ),
      _HeroTile(
        icon: Icons.event_available_outlined,
        label: loc.statsActiveDays,
        value: loc.statsDaysValue(summary.activeDays),
      ),
      if (summary.bestDay != null)
        _HeroTile(
          icon: Icons.star_outline,
          label: loc.statsBestDay,
          value: loc.statsBestDayValue(
            summary.bestDayMinutes,
            dateFormat.format(summary.bestDay!),
          ),
        ),
      if (summary.bestHour != null)
        _HeroTile(
          icon: Icons.access_time,
          label: loc.statsBestHour,
          value: loc.statsBestHourValue(
            hourFormat.format(
              DateTime(2000, 1, 1, summary.bestHour!),
            ),
            summary.bestHourMinutes,
          ),
        ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = constraints.maxWidth >= 720
            ? 4
            : constraints.maxWidth >= 480
                ? 3
                : 2;
        return GridView.count(
          crossAxisCount: cols,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: ThemeTokens.space3,
          crossAxisSpacing: ThemeTokens.space3,
          childAspectRatio: 1.7,
          children: tiles,
        );
      },
    );
  }
}

class _HeroTile extends StatelessWidget {
  const _HeroTile({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(ThemeTokens.space3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: scheme.primary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: scheme.onSurface.withValues(alpha: 0.75),
                    ),
                  ),
                ),
              ],
            ),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WeeklyBars extends StatelessWidget {
  const _WeeklyBars({required this.loc, required this.summary});
  final AppLocalizations loc;
  final StatsSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final data = summary.dailyMinutesLast7;
    final maxMinutes = data
        .map((d) => d.minutes)
        .fold<int>(0, (a, b) => a > b ? a : b)
        .clamp(60, 1 << 30);
    final locale = Localizations.localeOf(context).toString();
    final dayFormat = DateFormat('E', locale);
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
                              dayFormat.format(d.day),
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
}

class _DayOfWeekChart extends StatelessWidget {
  const _DayOfWeekChart({required this.loc, required this.summary});
  final AppLocalizations loc;
  final StatsSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final locale = Localizations.localeOf(context).toString();
    final dayFormat = DateFormat('E', locale);
    final values = summary.dayOfWeekMinutes;
    final maxMinutes =
        values.fold<int>(0, (a, b) => a > b ? a : b).clamp(30, 1 << 30);
    // ISO weekday labels: Monday is 1; build a synthetic date for each.
    final labels = List<String>.generate(7, (i) {
      final reference = DateTime(2024).add(Duration(days: i));
      return dayFormat.format(reference);
    });

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(ThemeTokens.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(loc.statsByWeekday, style: theme.textTheme.titleMedium),
            const SizedBox(height: ThemeTokens.space4),
            SizedBox(
              height: 140,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < 7; i++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Text(
                              '${values[i]}',
                              style: theme.textTheme.bodySmall,
                            ),
                            const SizedBox(height: 4),
                            Expanded(
                              child: Align(
                                alignment: Alignment.bottomCenter,
                                child: FractionallySizedBox(
                                  heightFactor: values[i] / maxMinutes,
                                  widthFactor: 1,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: scheme.tertiary,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              labels[i],
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
}

class _HourOfDayChart extends StatelessWidget {
  const _HourOfDayChart({required this.loc, required this.summary});
  final AppLocalizations loc;
  final StatsSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final values = summary.hourOfDayMinutes;
    final maxMinutes =
        values.fold<int>(0, (a, b) => a > b ? a : b).clamp(15, 1 << 30);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(ThemeTokens.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(loc.statsByHour, style: theme.textTheme.titleMedium),
            const SizedBox(height: ThemeTokens.space4),
            SizedBox(
              height: 140,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var h = 0; h < 24; h++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 1.5),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Expanded(
                              child: Align(
                                alignment: Alignment.bottomCenter,
                                child: FractionallySizedBox(
                                  heightFactor: values[h] / maxMinutes,
                                  widthFactor: 1,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: scheme.secondary,
                                      borderRadius: BorderRadius.circular(2),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            if (h % 6 == 0)
                              Text(
                                '$h',
                                style: theme.textTheme.bodySmall,
                              )
                            else
                              const SizedBox(height: 14),
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
}

class _AchievementsSection extends StatelessWidget {
  const _AchievementsSection({
    required this.loc,
    required this.achievements,
  });

  final AppLocalizations loc;
  final List<AchievementProgress> achievements;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unlockedCount = achievements.where((a) => a.unlocked).length;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(ThemeTokens.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  loc.statsAchievements,
                  style: theme.textTheme.titleMedium,
                ),
                Text(
                  loc.statsAchievementsUnlocked(
                    unlockedCount,
                    achievements.length,
                  ),
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
            const SizedBox(height: ThemeTokens.space4),
            LayoutBuilder(
              builder: (context, constraints) {
                final cols = constraints.maxWidth >= 720
                    ? 4
                    : constraints.maxWidth >= 480
                        ? 3
                        : 2;
                return GridView.count(
                  crossAxisCount: cols,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: ThemeTokens.space3,
                  crossAxisSpacing: ThemeTokens.space3,
                  children: [
                    for (final a in achievements)
                      _AchievementTile(progress: a, loc: loc),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _AchievementTile extends StatelessWidget {
  const _AchievementTile({required this.progress, required this.loc});

  final AchievementProgress progress;
  final AppLocalizations loc;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final unlocked = progress.unlocked;
    final iconColor =
        unlocked ? scheme.primary : scheme.onSurface.withValues(alpha: 0.35);
    final body = _bodyFor(loc, progress.achievement.id);
    final title = _titleFor(loc, progress.achievement.id);

    return Tooltip(
      message: '$title\n$body',
      child: Container(
        padding: const EdgeInsets.all(ThemeTokens.space3),
        decoration: BoxDecoration(
          color: unlocked
              ? scheme.primary.withValues(alpha: 0.08)
              : scheme.onSurface.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: unlocked
                ? scheme.primary.withValues(alpha: 0.4)
                : scheme.onSurface.withValues(alpha: 0.08),
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(progress.achievement.icon, color: iconColor, size: 28),
            Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: unlocked
                    ? scheme.onSurface
                    : scheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress.fraction,
                minHeight: 4,
                backgroundColor: scheme.onSurface.withValues(alpha: 0.08),
                valueColor: AlwaysStoppedAnimation(
                  unlocked
                      ? scheme.primary
                      : scheme.onSurface.withValues(alpha: 0.4),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _titleFor(AppLocalizations loc, AchievementId id) => switch (id) {
        AchievementId.firstSession => loc.achievementFirstSessionTitle,
        AchievementId.tenSessions => loc.achievementTenSessionsTitle,
        AchievementId.fiftySessions => loc.achievementFiftySessionsTitle,
        AchievementId.hundredSessions => loc.achievementHundredSessionsTitle,
        AchievementId.fiveHundredSessions =>
          loc.achievementFiveHundredSessionsTitle,
        AchievementId.oneHourTotal => loc.achievementOneHourTotalTitle,
        AchievementId.tenHoursTotal => loc.achievementTenHoursTotalTitle,
        AchievementId.fiftyHoursTotal => loc.achievementFiftyHoursTotalTitle,
        AchievementId.hundredHoursTotal =>
          loc.achievementHundredHoursTotalTitle,
        AchievementId.streakThree => loc.achievementStreakThreeTitle,
        AchievementId.streakSeven => loc.achievementStreakSevenTitle,
        AchievementId.streakThirty => loc.achievementStreakThirtyTitle,
        AchievementId.earlyBird => loc.achievementEarlyBirdTitle,
        AchievementId.nightOwl => loc.achievementNightOwlTitle,
        AchievementId.weekendWarrior => loc.achievementWeekendWarriorTitle,
        AchievementId.marathonDay => loc.achievementMarathonDayTitle,
      };

  String _bodyFor(AppLocalizations loc, AchievementId id) => switch (id) {
        AchievementId.firstSession => loc.achievementFirstSessionBody,
        AchievementId.tenSessions => loc.achievementTenSessionsBody,
        AchievementId.fiftySessions => loc.achievementFiftySessionsBody,
        AchievementId.hundredSessions => loc.achievementHundredSessionsBody,
        AchievementId.fiveHundredSessions =>
          loc.achievementFiveHundredSessionsBody,
        AchievementId.oneHourTotal => loc.achievementOneHourTotalBody,
        AchievementId.tenHoursTotal => loc.achievementTenHoursTotalBody,
        AchievementId.fiftyHoursTotal => loc.achievementFiftyHoursTotalBody,
        AchievementId.hundredHoursTotal => loc.achievementHundredHoursTotalBody,
        AchievementId.streakThree => loc.achievementStreakThreeBody,
        AchievementId.streakSeven => loc.achievementStreakSevenBody,
        AchievementId.streakThirty => loc.achievementStreakThirtyBody,
        AchievementId.earlyBird => loc.achievementEarlyBirdBody,
        AchievementId.nightOwl => loc.achievementNightOwlBody,
        AchievementId.weekendWarrior => loc.achievementWeekendWarriorBody,
        AchievementId.marathonDay => loc.achievementMarathonDayBody,
      };
}

class _ScreenTitle extends StatelessWidget {
  const _ScreenTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      text,
      style: theme.textTheme.headlineSmall?.copyWith(
        fontWeight: FontWeight.w700,
      ),
    );
  }
}
