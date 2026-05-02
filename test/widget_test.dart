import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomatito/app.dart';

void main() {
  testWidgets('App boots and renders the placeholder', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: TomatitoApp()));
    await tester.pump();
    expect(find.text('Tomatito'), findsOneWidget);
  });
}
