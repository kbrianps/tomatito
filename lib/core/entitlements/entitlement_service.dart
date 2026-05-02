import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tomatito/core/entitlements/feature.dart';

/// Gate for features that may be paid in a future version.
abstract class EntitlementService {
  bool isUnlocked(Feature feature);
  Stream<void> get changes;
}

final entitlementServiceProvider = Provider<EntitlementService>((ref) {
  throw UnimplementedError(
    'entitlementServiceProvider has no binding. Override it in main().',
  );
});
