import 'package:flutter_riverpod/flutter_riverpod.dart';

/// User-facing dial style choice. `ticks` is the spec default (30 short
/// radial marks); `arc` draws a smooth ring that depletes clockwise as
/// time passes.
enum DialStyle {
  ticks,
  arc;

  static DialStyle fromName(String? name) {
    if (name == null) return DialStyle.ticks;
    return DialStyle.values.firstWhere(
      (s) => s.name == name,
      orElse: () => DialStyle.ticks,
    );
  }
}

/// Active dial style. main() overrides with the value loaded from
/// `SettingsRepository`. Settings UI writes to it; `TimerDial` watches
/// it to pick the painter.
final dialStyleProvider = StateProvider<DialStyle>((ref) {
  return DialStyle.ticks;
});
