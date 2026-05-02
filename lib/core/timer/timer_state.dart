import 'package:meta/meta.dart' show immutable;
import 'package:tomatito/core/timer/period_kind.dart';

/// Snapshot of the timer engine. Streamed by `TimerEngine` on every tick,
/// pause, period change and reset. Compare with `==` for change detection.
@immutable
sealed class TimerState {
  const TimerState();
}

@immutable
class TimerIdle extends TimerState {
  const TimerIdle();
  @override
  bool operator ==(Object other) => other is TimerIdle;
  @override
  int get hashCode => 0;
}

@immutable
class TimerRunning extends TimerState {
  const TimerRunning({
    required this.kind,
    required this.elapsed,
    required this.total,
    required this.cycle,
    required this.totalCycles,
  });

  final PeriodKind kind;
  final Duration elapsed;
  final Duration total;
  final int cycle;
  final int totalCycles;

  Duration get remaining =>
      Duration(milliseconds: total.inMilliseconds - elapsed.inMilliseconds);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TimerRunning &&
          other.kind == kind &&
          other.elapsed == elapsed &&
          other.total == total &&
          other.cycle == cycle &&
          other.totalCycles == totalCycles;

  @override
  int get hashCode => Object.hash(kind, elapsed, total, cycle, totalCycles);
}

@immutable
class TimerPaused extends TimerState {
  const TimerPaused({
    required this.kind,
    required this.elapsed,
    required this.total,
    required this.cycle,
    required this.totalCycles,
  });

  final PeriodKind kind;
  final Duration elapsed;
  final Duration total;
  final int cycle;
  final int totalCycles;

  Duration get remaining =>
      Duration(milliseconds: total.inMilliseconds - elapsed.inMilliseconds);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TimerPaused &&
          other.kind == kind &&
          other.elapsed == elapsed &&
          other.total == total &&
          other.cycle == cycle &&
          other.totalCycles == totalCycles;

  @override
  int get hashCode => Object.hash(kind, elapsed, total, cycle, totalCycles);
}

@immutable
class TimerPeriodComplete extends TimerState {
  const TimerPeriodComplete({required this.completed, required this.next});

  final PeriodKind completed;
  final PeriodKind? next;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TimerPeriodComplete &&
          other.completed == completed &&
          other.next == next;

  @override
  int get hashCode => Object.hash(completed, next);
}
