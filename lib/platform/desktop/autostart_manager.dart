import 'dart:io';

import 'package:path/path.dart' as p;

/// Linux-only autostart manager. Writes (or removes) a freedesktop
/// `~/.config/autostart/tomatito.desktop` entry that the session
/// manager picks up on login.
///
/// Other desktop platforms (macOS, Windows) are not implemented yet;
/// `enable` / `disable` are best-effort no-ops there. Mobile platforms
/// have their own mechanisms; the SettingsRepository should only persist
/// the toggle when the host can act on it.
class AutostartManager {
  const AutostartManager();

  bool get isLinux => Platform.isLinux;

  Future<File> _desktopFile() async {
    final home = Platform.environment['HOME'];
    if (home == null || home.isEmpty) {
      throw StateError('HOME is not set; cannot manage autostart');
    }
    final dir = Directory(p.join(home, '.config', 'autostart'));
    if (!dir.existsSync()) {
      await dir.create(recursive: true);
    }
    return File(p.join(dir.path, 'tomatito.desktop'));
  }

  String _execPath() {
    // Best-effort: the running binary's path. Falls back to "tomatito"
    // (PATH lookup) so the user can install it later and the autostart
    // entry still works.
    return Platform.resolvedExecutable.isEmpty
        ? 'tomatito'
        : Platform.resolvedExecutable;
  }

  Future<bool> isEnabled() async {
    if (!isLinux) return false;
    try {
      final file = await _desktopFile();
      return file.existsSync();
    } on Object {
      return false;
    }
  }

  Future<void> enable() async {
    if (!isLinux) return;
    final file = await _desktopFile();
    final exec = _execPath();
    final body = <String>[
      '[Desktop Entry]',
      'Type=Application',
      'Name=Tomatito',
      'Comment=Pomodoro timer',
      'Exec=$exec',
      'Icon=tomatito',
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n');
    await file.writeAsString(body, flush: true);
  }

  Future<void> disable() async {
    if (!isLinux) return;
    try {
      final file = await _desktopFile();
      if (file.existsSync()) {
        await file.delete();
      }
    } on Object {
      // Ignore: best-effort cleanup. A leftover .desktop entry is not
      // worth crashing the app over.
    }
  }
}
