import 'package:flutter_foreground_task/flutter_foreground_task.dart';

/// Entry point for the foreground service isolate. Marked
/// `@pragma('vm:entry-point')` so tree-shaking does not drop it from the
/// release build; the plugin invokes it by name.
@pragma('vm:entry-point')
void tomatitoForegroundTaskEntrypoint() {
  FlutterForegroundTask.setTaskHandler(_TomatitoTaskHandler());
}

/// Minimal task handler. The Phase 3.x persistent notification is purely
/// driven by `updateService` calls from the main isolate; we do not tick
/// the timer in this handler isolate. The handler exists so the plugin
/// can host a foreground service that prevents Android from killing the
/// app process during a focus session.
class _TomatitoTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {}

  @override
  void onRepeatEvent(DateTime timestamp) {}

  @override
  Future<void> onDestroy(DateTime timestamp) async {}

  @override
  void onReceiveData(Object data) {}
}
