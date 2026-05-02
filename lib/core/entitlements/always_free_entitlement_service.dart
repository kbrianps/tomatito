import 'dart:async';

import 'package:tomatito/core/entitlements/entitlement_service.dart';
import 'package:tomatito/core/entitlements/feature.dart';

/// v1 implementation: every feature is unlocked. This file is the canonical
/// place to remove a feature from "free" if monetization ever ships; no
/// other call site in the app needs to change.
class AlwaysFreeEntitlementService implements EntitlementService {
  AlwaysFreeEntitlementService();

  @override
  bool isUnlocked(Feature feature) => true;

  @override
  Stream<void> get changes => const Stream<void>.empty();
}
