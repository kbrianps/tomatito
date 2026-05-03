import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/app.dart' show tomatitoNavigatorKey;
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/core/theme/theme_controller.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/core/window/window_state.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/screens/root_shell.dart';
import 'package:window_manager/window_manager.dart';

/// Custom desktop title bar. Theme-coloured (uses `colorScheme.surface`)
/// with four caption buttons: pin (always-on-top), minimize, compact-mode
/// toggle (small focused window like Windows 11 Clock Focus), close. The
/// title text on the left doubles as the drag area for moving the window;
/// double-tapping it toggles compact mode.
class TomatitoTitleBar extends ConsumerStatefulWidget {
  const TomatitoTitleBar({super.key});

  @override
  ConsumerState<TomatitoTitleBar> createState() => _TomatitoTitleBarState();
}

class _TomatitoTitleBarState extends ConsumerState<TomatitoTitleBar> {
  /// Bounds remembered before entering compact mode, restored on exit.
  /// Capped to `_maxRememberedSize` so a maximised window does not bring
  /// the user back to fullscreen on expand.
  Size? _preCompactSize;

  ProviderSubscription<int>? _navSub;

  @override
  void initState() {
    super.initState();
    _navSub = ref.listenManual<int>(navigationIndexProvider,
        (prev, next) async {
      // When the user leaves the Settings tab and the compact toggle is
      // still meant to be on (we expanded only to show Settings), pop
      // back into compact mode.
      if (prev == 2 && next != 2 && _wantCompactAfterSettings) {
        _wantCompactAfterSettings = false;
        if (!ref.read(compactModeProvider)) {
          await _toggleCompact(currentlyCompact: false);
        }
      }
    });
  }

  @override
  void dispose() {
    _navSub?.close();
    super.dispose();
  }

  /// True when the user opened Settings from compact mode; the title bar
  /// expanded the window to show the long settings list and should snap
  /// back into compact when the user navigates away from Settings.
  bool _wantCompactAfterSettings = false;

  static const Size _compactSize = Size(240, 320);
  static const Size _defaultRestoreSize = Size(420, 720);
  static const Size _maxRememberedSize = Size(560, 900);

  Future<void> _toggleCompact({required bool currentlyCompact}) async {
    if (currentlyCompact) {
      final restore = _preCompactSize ?? _defaultRestoreSize;
      // Some compositors keep "maximised" state even after a setSize; clear
      // it explicitly so the next setSize lands a normal-sized window.
      if (await windowManager.isMaximized()) {
        await windowManager.unmaximize();
      }
      await windowManager.setSize(restore);
      _preCompactSize = null;
      ref.read(compactModeProvider.notifier).state = false;
    } else {
      // If the user is currently maximised, remembering that size would
      // bring them back to fullscreen on expand. Cap the remembered size
      // to a phone-portrait shape; if the cap fires (or fetch fails),
      // fall back to the default restore size.
      Size? observed;
      try {
        observed = await windowManager.getSize();
      } on Object {
        observed = null;
      }
      _preCompactSize = _clampRestoreSize(observed);
      if (await windowManager.isMaximized()) {
        await windowManager.unmaximize();
      }
      await windowManager.setSize(_compactSize);
      ref.read(compactModeProvider.notifier).state = true;
    }
  }

  Size _clampRestoreSize(Size? observed) {
    if (observed == null) return _defaultRestoreSize;
    final w = observed.width
        .clamp(_compactSize.width, _maxRememberedSize.width);
    final h = observed.height
        .clamp(_compactSize.height, _maxRememberedSize.height);
    return Size(w, h);
  }

  Future<void> _togglePin({required bool currentlyPinned}) async {
    final next = !currentlyPinned;
    ref.read(alwaysOnTopProvider.notifier).state = next;
    await ref.read(settingsRepositoryProvider).saveAlwaysOnTop(value: next);
    await ref.read(windowControllerProvider).setAlwaysOnTop(value: next);
  }

  Future<void> _openSettings({required bool currentlyCompact}) async {
    // If the user is in compact mode, expand back to a normal window
    // first so the Settings list has room to breathe; remember that we
    // expanded just for Settings so we can snap back into compact when
    // the user leaves the Settings tab.
    if (currentlyCompact) {
      _wantCompactAfterSettings = true;
      await _toggleCompact(currentlyCompact: true);
    }
    ref.read(navigationIndexProvider.notifier).state = 2;
  }

  Future<void> _onMinimize() async {
    final settings = ref.read(settingsRepositoryProvider);
    final pref = await settings.loadMinimizeToTray();
    if (pref == null) {
      final choice = await _askMinimizeDestination();
      if (choice == null) return;
      await settings.saveMinimizeToTray(value: choice);
      await _applyMinimize(toTray: choice);
    } else {
      await _applyMinimize(toTray: pref);
    }
  }

  Future<bool?> _askMinimizeDestination() async {
    // The title bar lives above the Navigator (MaterialApp.builder), so
    // its own context has no Navigator ancestor. Route through the
    // global navigator key instead.
    final navContext = tomatitoNavigatorKey.currentContext;
    if (navContext == null) return null;
    final loc = AppLocalizations.of(navContext);
    return showDialog<bool>(
      context: navContext,
      builder: (ctx) => AlertDialog(
        title: Text(loc.minimizeDialogTitle),
        content: Text(loc.minimizeDialogBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(loc.minimizeDialogTaskbar),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(loc.minimizeDialogTray),
          ),
        ],
      ),
    );
  }

  Future<void> _applyMinimize({required bool toTray}) async {
    if (toTray) {
      await windowManager.hide();
    } else {
      await windowManager.minimize();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context);
    final pinned = ref.watch(alwaysOnTopProvider);
    final compact = ref.watch(compactModeProvider);
    final themeId = ref.watch(themeControllerProvider);
    final isShape = themeId == AppThemeId.tomatitoShape && compact;
    final scheme = theme.colorScheme;

    return Container(
      height: 36,
      // Transparent strip in shape+compact so the bundled tomato PNG
      // can show all the way to the top of the window.
      color: isShape ? Colors.transparent : scheme.surface,
      child: Row(
        children: [
          Expanded(
            child: DragToMoveArea(
              child: GestureDetector(
                onDoubleTap: () => _toggleCompact(currentlyCompact: compact),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: ThemeTokens.space4,
                  ),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    // Compact mode hides the app name so the dial gets more
                    // visual room; the drag area still works (whole row).
                    child: compact
                        ? const SizedBox.shrink()
                        : Text(
                            loc.appName,
                            style: theme.textTheme.bodySmall?.copyWith(
                              fontWeight: FontWeight.w600,
                              color: scheme.onSurface.withValues(alpha: 0.85),
                            ),
                          ),
                  ),
                ),
              ),
            ),
          ),
          // Settings shortcut only in compact mode: the user already has
          // the Settings tab in normal mode and asked for the title-bar
          // entry to disappear when not in the small window.
          if (compact)
            _CaptionButton(
              tooltip: loc.navSettings,
              icon: Icons.tune,
              onPressed: () => _openSettings(currentlyCompact: compact),
            ),
          _CaptionButton(
            tooltip: pinned ? loc.titleBarUnpin : loc.titleBarPin,
            icon: pinned ? Icons.push_pin : Icons.push_pin_outlined,
            iconColor:
                pinned
                    ? scheme.primary
                    : scheme.onSurface.withValues(alpha: 0.85),
            onPressed: () => _togglePin(currentlyPinned: pinned),
          ),
          // Minimize is hidden in compact mode (the small window is
          // already a focused micro-dock; the user wants close + expand
          // only in that mode).
          if (!compact)
            _CaptionButton(
              tooltip: loc.titleBarMinimize,
              icon: Icons.remove,
              onPressed: _onMinimize,
            ),
          _CaptionButton(
            tooltip: compact ? loc.titleBarExpand : loc.titleBarCompact,
            icon: compact ? Icons.open_in_full : Icons.aspect_ratio_outlined,
            onPressed: () => _toggleCompact(currentlyCompact: compact),
          ),
          _CaptionButton(
            tooltip: loc.titleBarClose,
            icon: Icons.close,
            isClose: true,
            onPressed: windowManager.close,
          ),
        ],
      ),
    );
  }
}

class _CaptionButton extends StatefulWidget {
  const _CaptionButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
    this.iconColor,
    this.isClose = false,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;
  final Color? iconColor;
  final bool isClose;

  @override
  State<_CaptionButton> createState() => _CaptionButtonState();
}

class _CaptionButtonState extends State<_CaptionButton> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final hoverBg =
        widget.isClose
            ? const Color(0xFFE81123)
            : scheme.onSurface.withValues(alpha: 0.08);
    final defaultIconColor =
        widget.iconColor ?? scheme.onSurface.withValues(alpha: 0.85);
    final iconColor =
        _hover && widget.isClose ? Colors.white : defaultIconColor;

    // Semantics + the hover background do the work that a Tooltip would,
    // without needing an Overlay ancestor (the title bar lives above the
    // Navigator that provides one).
    return Semantics(
      button: true,
      label: widget.tooltip,
      child: MouseRegion(
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onPressed,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 80),
            width: 46,
            color: _hover ? hoverBg : Colors.transparent,
            child: Center(child: Icon(widget.icon, size: 16, color: iconColor)),
          ),
        ),
      ),
    );
  }
}
