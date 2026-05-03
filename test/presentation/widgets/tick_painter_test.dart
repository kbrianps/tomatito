import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/presentation/widgets/tick_painter.dart';

void main() {
  testWidgets('TickPainter paints without errors at boundary progress values', (
    tester,
  ) async {
    for (final p in <double>[0, 0.25, 0.5, 0.75, 1]) {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 200,
              height: 200,
              child: CustomPaint(
                size: const Size(200, 200),
                painter: TickPainter(
                  progress: p,
                  activeColor: const Color(0xFFE74C3C),
                  inactiveColor: const Color(0xFF999999),
                ),
              ),
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull, reason: 'progress = $p');
    }
  });

  test('TickPainter shouldRepaint reacts only to relevant changes', () {
    final a = TickPainter(
      progress: 0.5,
      activeColor: const Color(0xFFE74C3C),
      inactiveColor: const Color(0xFF999999),
    );
    final sameInputs = TickPainter(
      progress: 0.5,
      activeColor: const Color(0xFFE74C3C),
      inactiveColor: const Color(0xFF999999),
    );
    final differentProgress = TickPainter(
      progress: 0.6,
      activeColor: const Color(0xFFE74C3C),
      inactiveColor: const Color(0xFF999999),
    );
    expect(a.shouldRepaint(sameInputs), isFalse);
    expect(a.shouldRepaint(differentProgress), isTrue);
  });
}
