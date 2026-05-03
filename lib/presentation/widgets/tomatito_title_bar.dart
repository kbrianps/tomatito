import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/core/window/window_controller.dart';
import 'package:tomatito/core/window/window_state.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:window_manager/window_manager.dart';

/// Custom desktop title bar. Theme-coloured (uses `colorScheme.surface`)
/// with four caption buttons: pin (always-on-top), minimize, maximize /
/// restore, close. The title text on the left doubles as the drag area
/// for moving the window; double-tapping it toggles maximize / restore.
class TomatitoTitleBar extends ConsumerStatefulWidget {
  const TomatitoTitleBar({super.key});

  @override
  ConsumerState<TomatitoTitleBar> createState() => _TomatitoTitleBarState();
}

class _TomatitoTitleBarState extends ConsumerState<TomatitoTitleBar>
    with WindowListener {
  bool _isMaximized = false;

  @override
  void initState() {
    super.initState();
    windowManager.addListener(this);
    _refreshMaximized();
  }

  @override
  void dispose() {
    windowManager.removeListener(this);
    super.dispose();
  }

  Future<void> _refreshMaximized() async {
    final m = await windowManager.isMaximized();
    if (!mounted) return;
    setState(() => _isMaximized = m);
  }

  @override
  void onWindowMaximize() => _refreshMaximized();

  @override
  void onWindowUnmaximize() => _refreshMaximized();

  Future<void> _toggleMaximize() async {
    if (_isMaximized) {
      await windowManager.unmaximize();
    } else {
      await windowManager.maximize();
    }
  }

  Future<void> _togglePin({required bool currentlyPinned}) async {
    final next = !currentlyPinned;
    ref.read(alwaysOnTopProvider.notifier).state = next;
    await ref.read(settingsRepositoryProvider).saveAlwaysOnTop(value: next);
    await ref.read(windowControllerProvider).setAlwaysOnTop(value: next);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context);
    final pinned = ref.watch(alwaysOnTopProvider);
    final scheme = theme.colorScheme;

    return Container(
      height: 36,
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(
          bottom: BorderSide(color: scheme.onSurface.withValues(alpha: 0.06)),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: DragToMoveArea(
              child: GestureDetector(
                onDoubleTap: _toggleMaximize,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: ThemeTokens.space4,
                  ),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
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
          _CaptionButton(
            tooltip: pinned ? loc.titleBarUnpin : loc.titleBarPin,
            icon: pinned ? Icons.push_pin : Icons.push_pin_outlined,
            iconColor:
                pinned
                    ? scheme.primary
                    : scheme.onSurface.withValues(alpha: 0.85),
            onPressed: () => _togglePin(currentlyPinned: pinned),
          ),
          _CaptionButton(
            tooltip: loc.titleBarMinimize,
            icon: Icons.remove,
            onPressed: windowManager.minimize,
          ),
          _CaptionButton(
            tooltip: _isMaximized ? loc.titleBarRestore : loc.titleBarMaximize,
            icon: _isMaximized ? Icons.filter_none_outlined : Icons.crop_square,
            onPressed: _toggleMaximize,
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
            ? const Color(0xFFE81123) // Windows-style close-hover red
            : scheme.onSurface.withValues(alpha: 0.08);
    final defaultIconColor =
        widget.iconColor ?? scheme.onSurface.withValues(alpha: 0.85);
    final iconColor =
        _hover && widget.isClose ? Colors.white : defaultIconColor;

    return Tooltip(
      message: widget.tooltip,
      waitDuration: const Duration(milliseconds: 600),
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
