import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/data/settings_repository.dart';

/// Holds the current `AppThemeId` and persists changes through the settings
/// repository. UI watches this provider; the cross-fade is driven by
/// `MaterialApp.themeAnimationDuration` so theme switching is animated.
class ThemeController extends StateNotifier<AppThemeId> {
  ThemeController(this._repo) : super(AppThemeId.tomatito) {
    unawaited(_load());
  }

  final SettingsRepository _repo;

  Future<void> _load() async {
    state = await _repo.loadThemeId();
  }

  Future<void> setTheme(AppThemeId id) async {
    state = id;
    await _repo.saveThemeId(id);
  }
}

final themeControllerProvider =
    StateNotifierProvider<ThemeController, AppThemeId>((ref) {
      return ThemeController(ref.watch(settingsRepositoryProvider));
    });
