import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'package:tomatito/core/timer/session_checkpoint.dart';

/// Persists a single `SessionCheckpoint` to disk. One file per app instance,
/// rewritten in place. Read tolerates missing or corrupt files (returns null);
/// clear is idempotent.
class CheckpointStore {
  CheckpointStore(this._file);

  final File _file;

  static Future<CheckpointStore> create() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'tomatito_checkpoint.json'));
    return CheckpointStore(file);
  }

  Future<SessionCheckpoint?> load() async {
    if (!_file.existsSync()) return null;
    try {
      final raw = await _file.readAsString();
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return SessionCheckpoint.fromJson(json);
    } on Object {
      return null;
    }
  }

  Future<void> save(SessionCheckpoint checkpoint) async {
    await _file.parent.create(recursive: true);
    await _file.writeAsString(jsonEncode(checkpoint.toJson()), flush: true);
  }

  Future<void> clear() async {
    if (_file.existsSync()) {
      await _file.delete();
    }
  }
}
