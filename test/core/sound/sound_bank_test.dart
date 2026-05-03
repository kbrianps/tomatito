import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/sound/sound_bank.dart';

void main() {
  group('SoundBank', () {
    test('all options have unique non-empty ids', () {
      final ids = SoundBank.all.map((o) => o.id).toList();
      expect(ids.toSet().length, ids.length, reason: 'duplicate ids in $ids');
      for (final id in ids) {
        expect(id, isNotEmpty);
      }
    });

    test('all options have asset paths under assets/sounds/', () {
      for (final o in SoundBank.all) {
        expect(o.assetPath, startsWith('assets/sounds/'));
        expect(o.assetPath, endsWith('.ogg'));
      }
    });

    test('byId returns the matching option', () {
      expect(SoundBank.byId('soft_bell'), SoundBank.softBell);
      expect(SoundBank.byId('wood_block'), SoundBank.woodBlock);
      expect(SoundBank.byId('gentle_pulse'), SoundBank.gentlePulse);
    });

    test('byId on unknown id returns the default option', () {
      expect(SoundBank.byId('not_a_real_id'), SoundBank.defaultOption);
    });

    test('SoundOption equality is by id', () {
      const a = SoundOption(id: 'x', assetPath: 'a', nameKey: 'one');
      const b = SoundOption(id: 'x', assetPath: 'b', nameKey: 'two');
      expect(a, b);
    });
  });
}
