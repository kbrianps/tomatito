import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:url_launcher/url_launcher.dart';

/// Renders a bundled markdown asset (FAQ / Privacy / Terms) in a Scaffold,
/// styled for comfortable in-app reading: a constrained text column,
/// generous line height, themed headings, dim blockquotes, and tap-to-open
/// external links.
///
/// Pick the asset path based on the current locale via the `forLocale`
/// constructor: the caller passes both an English and a Portuguese asset
/// path; the screen uses whichever matches the active language code.
class MarkdownDocScreen extends StatelessWidget {
  const MarkdownDocScreen({
    required this.title,
    required this.assetPath,
    super.key,
  });

  factory MarkdownDocScreen.forLocale({
    required String title,
    required String enAsset,
    required String ptAsset,
    required Locale locale,
  }) {
    final asset = locale.languageCode == 'pt' ? ptAsset : enAsset;
    return MarkdownDocScreen(title: title, assetPath: asset);
  }

  final String title;
  final String assetPath;

  static const double _maxContentWidth = 720;

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
          return Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: _maxContentWidth),
              child: SelectionArea(
                child: Markdown(
                  data: snapshot.data!,
                  padding: const EdgeInsets.symmetric(
                    horizontal: ThemeTokens.space6,
                    vertical: ThemeTokens.space5,
                  ),
                  styleSheet: _buildStyleSheet(theme),
                  onTapLink: (text, href, title) =>
                      _openLink(context, href),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _openLink(BuildContext context, String? href) async {
    if (href == null || href.isEmpty) return;
    final uri = Uri.tryParse(href);
    if (uri == null) return;
    final launched = await launchUrl(
      uri,
      mode: LaunchMode.externalApplication,
    );
    if (!launched && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open $href')),
      );
    }
  }

  MarkdownStyleSheet _buildStyleSheet(ThemeData theme) {
    final scheme = theme.colorScheme;
    final base = MarkdownStyleSheet.fromTheme(theme);
    final body = (theme.textTheme.bodyLarge ?? const TextStyle()).copyWith(
      height: 1.55,
      color: scheme.onSurface.withValues(alpha: 0.92),
    );
    final muted = body.copyWith(
      color: scheme.onSurface.withValues(alpha: 0.7),
    );
    return base.copyWith(
      p: body,
      h1: theme.textTheme.headlineMedium?.copyWith(
        fontWeight: FontWeight.w700,
        color: scheme.onSurface,
      ),
      h2: theme.textTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w700,
        color: scheme.onSurface,
      ),
      h3: theme.textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.w600,
        color: scheme.onSurface,
      ),
      h1Padding: const EdgeInsets.only(bottom: ThemeTokens.space3),
      h2Padding: const EdgeInsets.only(
        top: ThemeTokens.space5,
        bottom: ThemeTokens.space2,
      ),
      h3Padding: const EdgeInsets.only(
        top: ThemeTokens.space4,
        bottom: ThemeTokens.space2,
      ),
      pPadding: const EdgeInsets.only(bottom: ThemeTokens.space3),
      blockSpacing: ThemeTokens.space3,
      listIndent: 22,
      listBullet: muted,
      a: body.copyWith(
        color: scheme.primary,
        decoration: TextDecoration.underline,
        decorationColor: scheme.primary.withValues(alpha: 0.5),
      ),
      em: body.copyWith(fontStyle: FontStyle.italic, color: muted.color),
      strong: body.copyWith(fontWeight: FontWeight.w700),
      blockquote: muted.copyWith(fontStyle: FontStyle.italic),
      blockquotePadding: const EdgeInsets.fromLTRB(
        ThemeTokens.space4,
        ThemeTokens.space3,
        ThemeTokens.space3,
        ThemeTokens.space3,
      ),
      blockquoteDecoration: BoxDecoration(
        color: scheme.onSurface.withValues(alpha: 0.04),
        border: Border(
          left: BorderSide(
            color: scheme.primary.withValues(alpha: 0.6),
            width: 3,
          ),
        ),
      ),
      code: (theme.textTheme.bodyMedium ?? const TextStyle()).copyWith(
        fontFamily: 'monospace',
        backgroundColor: scheme.onSurface.withValues(alpha: 0.06),
      ),
      codeblockPadding: const EdgeInsets.all(ThemeTokens.space3),
      codeblockDecoration: BoxDecoration(
        color: scheme.onSurface.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
      ),
      horizontalRuleDecoration: BoxDecoration(
        border: Border(
          top: BorderSide(
            color: scheme.onSurface.withValues(alpha: 0.12),
          ),
        ),
      ),
    );
  }
}
