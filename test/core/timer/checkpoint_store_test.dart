import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/timer/checkpoint_store.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/session_checkpoint.dart';

void main() {
  late Directory tempDir;
  late File file;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('tomatito_cp_test_');
    file = File('${tempDir.path}/checkpoint.json');
  });

  tearDown(() async {
    if (tempDir.existsSync()) {
      await tempDir.delete(recursive: true);
    }
  });

  final fixture = SessionCheckpoint(
    kind: PeriodKind.shortBreak,
    elapsed: const Duration(minutes: 2),
    total: const Duration(minutes: 5),
    cycle: 3,
    totalCycles: 4,
    focusSessionsCompleted: 2,
    savedAt: DateTime(2026, 5, 2, 14, 30),
  );

  test('load on missing file returns null', () async {
    final store = CheckpointStore(file);
    expect(await store.load(), isNull);
  });

  test('save then load returns the same checkpoint', () async {
    final store = CheckpointStore(file);
    await store.save(fixture);
    expect(await store.load(), fixture);
  });

  test('load on corrupt file returns null', () async {
    await file.writeAsString('this is not valid json {');
    final store = CheckpointStore(file);
    expect(await store.load(), isNull);
  });

  test('clear removes the file (idempotent)', () async {
    final store = CheckpointStore(file);
    await store.save(fixture);
    expect(file.existsSync(), isTrue);
    await store.clear();
    expect(file.existsSync(), isFalse);
    // Second call must not throw.
    await store.clear();
  });
}
