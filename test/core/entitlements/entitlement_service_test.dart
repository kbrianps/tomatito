import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/core/entitlements/always_free_entitlement_service.dart';
import 'package:tomatito/core/entitlements/feature.dart';

void main() {
  test('AlwaysFreeEntitlementService unlocks every feature', () {
    final svc = AlwaysFreeEntitlementService();
    for (final f in Feature.values) {
      expect(svc.isUnlocked(f), isTrue, reason: '$f should be unlocked in v1');
    }
  });
}
