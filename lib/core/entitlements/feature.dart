/// Features that may eventually be paid. Each value is checked via
/// `EntitlementService.isUnlocked(...)` even when the v1 implementation
/// always returns true. Keeps call sites stable when monetization arrives,
/// per the spec's "no rewrites" architecture.
enum Feature {
  cloudSync,
  customSoundPacks,
  advancedAnalytics,
  multiDeviceAggregation,
  extraThemePacks,
  calendarIntegration,
}
