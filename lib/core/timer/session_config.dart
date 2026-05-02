import 'package:meta/meta.dart' show immutable;

/// Per-session configuration. A user can either pick a total session length
/// (auto-divide mode, the default) or specify focus / break / cycle counts
/// directly (manual mode). The session-planning algorithm lives separately
/// in `session_planner.dart` and is its own pure-Dart class with thorough
/// unit tests (Phase 2).
@immutable
class SessionConfig {
  const SessionConfig({
    required this.focus,
    required this.shortBreak,
    required this.longBreak,
    required this.cyclesBeforeLongBreak,
    this.autoStartBreaks = true,
    this.autoStartFocus = false,
    this.strictMode = false,
  });

  /// Spec-aligned defaults: 25 / 5 with a 15-minute long break every 4 cycles.
  /// Defaults are a "fine starting point", not a recommendation. The
  /// "Why these numbers?" panel makes the science clear.
  static const SessionConfig pomodoroDefault = SessionConfig(
    focus: Duration(minutes: 25),
    shortBreak: Duration(minutes: 5),
    longBreak: Duration(minutes: 15),
    cyclesBeforeLongBreak: 4,
  );

  final Duration focus;
  final Duration shortBreak;
  final Duration longBreak;
  final int cyclesBeforeLongBreak;
  final bool autoStartBreaks;
  final bool autoStartFocus;
  final bool strictMode;

  SessionConfig copyWith({
    Duration? focus,
    Duration? shortBreak,
    Duration? longBreak,
    int? cyclesBeforeLongBreak,
    bool? autoStartBreaks,
    bool? autoStartFocus,
    bool? strictMode,
  }) => SessionConfig(
    focus: focus ?? this.focus,
    shortBreak: shortBreak ?? this.shortBreak,
    longBreak: longBreak ?? this.longBreak,
    cyclesBeforeLongBreak: cyclesBeforeLongBreak ?? this.cyclesBeforeLongBreak,
    autoStartBreaks: autoStartBreaks ?? this.autoStartBreaks,
    autoStartFocus: autoStartFocus ?? this.autoStartFocus,
    strictMode: strictMode ?? this.strictMode,
  );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SessionConfig &&
          other.focus == focus &&
          other.shortBreak == shortBreak &&
          other.longBreak == longBreak &&
          other.cyclesBeforeLongBreak == cyclesBeforeLongBreak &&
          other.autoStartBreaks == autoStartBreaks &&
          other.autoStartFocus == autoStartFocus &&
          other.strictMode == strictMode;

  @override
  int get hashCode => Object.hash(
    focus,
    shortBreak,
    longBreak,
    cyclesBeforeLongBreak,
    autoStartBreaks,
    autoStartFocus,
    strictMode,
  );
}
