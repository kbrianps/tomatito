import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/timer/period_kind.dart';
import 'package:tomatito/core/timer/session_checkpoint.dart';

void main() {
  group('SessionCheckpoint', () {
    final fixture = SessionCheckpoint(
      kind: PeriodKind.focus,
      elapsed: const Duration(minutes: 7, seconds: 12),
      total: const Duration(minutes: 25),
      cycle: 2,
      totalCycles: 4,
      focusSessionsCompleted: 1,
      savedAt: DateTime(2026, 5, 2, 14, 30),
    );

    test('toJson + fromJson is a perfect round trip', () {
      final restored = SessionCheckpoint.fromJson(fixture.toJson());
      expect(restored, fixture);
    });

    test('fromJson on corrupt input returns null', () {
      expect(
        SessionCheckpoint.fromJson(<String, dynamic>{
          'kind': 'not_a_real_kind',
          'elapsedMs': 1,
          'totalMs': 2,
          'cycle': 1,
          'totalCycles': 1,
          'focusCompleted': 0,
          'savedAtIso': '2026-05-02T14:30:00',
        }),
        isNull,
      );
    });

    test('fromJson on missing keys returns null', () {
      expect(
        SessionCheckpoint.fromJson(const <String, dynamic>{'kind': 'focus'}),
        isNull,
      );
    });

    test('isFreshAt returns true within 30 minutes', () {
      final cp = fixture;
      final later = cp.savedAt.add(const Duration(minutes: 29));
      expect(cp.isFreshAt(later), isTrue);
    });

    test('isFreshAt returns false past 30 minutes', () {
      final cp = fixture;
      final later = cp.savedAt.add(const Duration(minutes: 31));
      expect(cp.isFreshAt(later), isFalse);
    });

    test(
      'isFreshAt is symmetric: clock-jumped-backwards still gives stale',
      () {
        final cp = fixture;
        final earlier = cp.savedAt.subtract(const Duration(minutes: 31));
        expect(cp.isFreshAt(earlier), isFalse);
      },
    );
  });
}
