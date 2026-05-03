import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_markdown/flutter_markdown.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';

/// Renders a bundled markdown asset in a plain Scaffold. Used for the
/// in-app Privacy policy and Terms of use views; the same .md files live
/// in `docs/` so the source-tree and the in-app version stay identical.
class MarkdownDocScreen extends StatelessWidget {
  const MarkdownDocScreen({
    required this.title,
    required this.assetPath,
    super.key,
  });

  final String title;
  final String assetPath;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: FutureBuilder<String>(
        future: rootBundle.loadString(assetPath),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || snapshot.data == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(ThemeTokens.space5),
                child: Text(
                  'Could not load $assetPath',
                  style: theme.textTheme.bodyMedium,
                ),
              ),
            );
          }
          return Markdown(
            data: snapshot.data!,
            padding: const EdgeInsets.all(ThemeTokens.space5),
            styleSheet: MarkdownStyleSheet.fromTheme(theme),
          );
        },
      ),
    );
  }
}
