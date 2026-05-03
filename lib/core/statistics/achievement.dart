import 'package:flutter/material.dart';

/// Catalogue of achievements unlocked by accumulated focus activity. Each
/// id has a stable name (used as a localisation key) so .arb files can
/// translate the title and description independently.
enum AchievementId {
  firstSession,
  tenSessions,
  fiftySessions,
  hundredSessions,
  fiveHundredSessions,
  oneHourTotal,
  tenHoursTotal,
  fiftyHoursTotal,
  hundredHoursTotal,
  streakThree,
  streakSeven,
  streakThirty,
  earlyBird,
  nightOwl,
  weekendWarrior,
  marathonDay,
}

/// Catalogue entry for an achievement. The `progress` and `target` fields
/// drive the locked-state progress bar and the share text.
class Achievement {
  const Achievement({
    required this.id,
    required this.icon,
    required this.target,
  });

  final AchievementId id;
  final IconData icon;
  final int target;
}

/// Static registry. Order here is the order shown in the grid.
class AchievementRegistry {
  AchievementRegistry._();

  static const List<Achievement> all = [
    Achievement(
      id: AchievementId.firstSession,
      icon: Icons.play_circle_outline,
      target: 1,
    ),
    Achievement(
      id: AchievementId.tenSessions,
      icon: Icons.local_fire_department_outlined,
      target: 10,
    ),
    Achievement(
      id: AchievementId.fiftySessions,
      icon: Icons.workspaces_outlined,
      target: 50,
    ),
    Achievement(
      id: AchievementId.hundredSessions,
      icon: Icons.military_tech_outlined,
      target: 100,
    ),
    Achievement(
      id: AchievementId.fiveHundredSessions,
      icon: Icons.emoji_events_outlined,
      target: 500,
    ),
    Achievement(
      id: AchievementId.oneHourTotal,
      icon: Icons.timer_outlined,
      target: 60,
    ),
    Achievement(
      id: AchievementId.tenHoursTotal,
      icon: Icons.access_time,
      target: 600,
    ),
    Achievement(
      id: AchievementId.fiftyHoursTotal,
      icon: Icons.history_toggle_off,
      target: 3000,
    ),
    Achievement(
      id: AchievementId.hundredHoursTotal,
      icon: Icons.hourglass_top_outlined,
      target: 6000,
    ),
    Achievement(
      id: AchievementId.streakThree,
      icon: Icons.bolt_outlined,
      target: 3,
    ),
    Achievement(
      id: AchievementId.streakSeven,
      icon: Icons.local_fire_department,
      target: 7,
    ),
    Achievement(
      id: AchievementId.streakThirty,
      icon: Icons.whatshot_outlined,
      target: 30,
    ),
    Achievement(
      id: AchievementId.earlyBird,
      icon: Icons.wb_sunny_outlined,
      target: 5,
    ),
    Achievement(
      id: AchievementId.nightOwl,
      icon: Icons.nightlight_outlined,
      target: 5,
    ),
    Achievement(
      id: AchievementId.weekendWarrior,
      icon: Icons.weekend_outlined,
      target: 10,
    ),
    Achievement(
      id: AchievementId.marathonDay,
      icon: Icons.directions_run,
      target: 240,
    ),
  ];
}

/// A computed view of an achievement: how close the user is to unlocking it,
/// and whether they already have. Progress is clamped to [0, target].
class AchievementProgress {
  const AchievementProgress({
    required this.achievement,
    required this.progress,
    required this.unlocked,
  });

  final Achievement achievement;
  final int progress;
  final bool unlocked;

  double get fraction =>
      achievement.target == 0 ? 0 : (progress / achievement.target).clamp(0, 1);
}
