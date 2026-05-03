import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:tray_manager/tray_manager.dart';
import 'package:window_manager/window_manager.dart';

/// Owns the system tray icon for desktop platforms. Constructed once in
/// `main()` and kept alive by the `AppLifecycle`. Restores the window on
/// tray click; lets the user fully quit via the tray menu.
class TrayController with TrayListener {
  TrayController();

  bool _attached = false;

  bool get _supported =>
      !kIsWeb && (Platform.isLinux || Platform.isMacOS || Platform.isWindows);

  Future<void> install() async {
    if (!_supported || _attached) return;
    try {
      // assets/icon/tray_icon.png is bundled via pubspec; trayManager
      // resolves bundled-asset paths automatically.
      await trayManager.setIcon('assets/icon/tray_icon.png');
      await trayManager.setToolTip('Tomatito');
      await trayManager.setContextMenu(
        Menu(items: [
          MenuItem(key: 'show', label: 'Show Tomatito'),
          MenuItem.separator(),
          MenuItem(key: 'quit', label: 'Quit'),
        ]),
      );
      trayManager.addListener(this);
      _attached = true;
    } on Object {
      // Some Linux desktops (no StatusNotifier host, no system tray
      // protocol) cannot host a tray icon. Swallow the failure: the
      // user can still use the regular minimize.
    }
  }

  Future<void> dispose() async {
    if (!_attached) return;
    trayManager.removeListener(this);
    try {
      await trayManager.destroy();
    } on Object {
      // best-effort
    }
    _attached = false;
  }

  Future<void> _showWindow() async {
    if (!_supported) return;
    await windowManager.show();
    await windowManager.focus();
  }

  @override
  void onTrayIconMouseDown() {
    _showWindow();
  }

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    switch (menuItem.key) {
      case 'show':
        _showWindow();
      case 'quit':
        windowManager.close();
    }
  }
}
