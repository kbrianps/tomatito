import 'package:flutter/widgets.dart' show Locale;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// User-facing locale preference. `system` means follow the OS locale (the
/// default); `en` and `pt` force the matching locale regardless of OS.
enum LocaleChoice {
  system,
  en,
  pt;

  /// Resolve to a [Locale] for `MaterialApp.locale`. Returns null for
  /// `system` so Flutter falls back to the platform locale (which may map
  /// to en or pt via the supportedLocales list, or to en when neither
  /// matches).
  Locale? toLocale() {
    switch (this) {
      case LocaleChoice.system:
        return null;
      case LocaleChoice.en:
        return const Locale('en');
      case LocaleChoice.pt:
        return const Locale('pt');
    }
  }

  static LocaleChoice fromName(String? name) {
    if (name == null) return LocaleChoice.system;
    return LocaleChoice.values.firstWhere(
      (c) => c.name == name,
      orElse: () => LocaleChoice.system,
    );
  }
}

/// Active locale preference. main() overrides with the value loaded from
/// `SettingsRepository`. Settings UI writes to it; `MaterialApp` watches
/// it for the `locale` parameter.
final localeChoiceProvider = StateProvider<LocaleChoice>((ref) {
  return LocaleChoice.system;
});
