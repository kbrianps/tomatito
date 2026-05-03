import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';
import 'package:tomatito/presentation/screens/markdown_doc_screen.dart';
import 'package:tomatito/presentation/screens/onboarding_screen.dart';
import 'package:url_launcher/url_launcher.dart';

class AboutScreen extends ConsumerWidget {
  const AboutScreen({super.key});

  static const _version = '0.1.0';
  static const _sourceUrl = 'https://github.com/kbrianps/tomatito';
  static const _supportUrl = 'https://github.com/sponsors/kbrianps';

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(loc.settingsAbout)),
      body: ListView(
        padding: const EdgeInsets.all(ThemeTokens.space5),
        children: [
          Text(loc.appName, style: theme.textTheme.headlineLarge),
          const SizedBox(height: ThemeTokens.space2),
          Text(loc.tagline, style: theme.textTheme.bodyLarge),
          const SizedBox(height: ThemeTokens.space2),
          Text(
            loc.aboutVersion(_version),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: ThemeTokens.space5),
          ListTile(
            title: Text(loc.aboutFaq),
            subtitle: Text(loc.aboutFaqSubtitle),
            trailing: const Icon(Icons.chevron_right),
            onTap:
                () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder:
                        (_) => MarkdownDocScreen.forLocale(
                          title: loc.aboutFaq,
                          enAsset: 'docs/FAQ.md',
                          ptAsset: 'docs/FAQ.pt.md',
                          locale: Localizations.localeOf(context),
                        ),
                  ),
                ),
          ),
          const Divider(),
          ListTile(
            title: Text(loc.aboutLicenses),
            trailing: const Icon(Icons.chevron_right),
            onTap:
                () => showLicensePage(
                  context: context,
                  applicationName: loc.appName,
                  applicationVersion: _version,
                ),
          ),
          ListTile(
            title: Text(loc.aboutPrivacy),
            trailing: const Icon(Icons.chevron_right),
            onTap:
                () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder:
                        (_) => MarkdownDocScreen.forLocale(
                          title: loc.aboutPrivacy,
                          enAsset: 'docs/PRIVACY_POLICY.md',
                          ptAsset: 'docs/PRIVACY_POLICY.pt.md',
                          locale: Localizations.localeOf(context),
                        ),
                  ),
                ),
          ),
          ListTile(
            title: Text(loc.aboutTerms),
            trailing: const Icon(Icons.chevron_right),
            onTap:
                () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder:
                        (_) => MarkdownDocScreen.forLocale(
                          title: loc.aboutTerms,
                          enAsset: 'docs/TERMS.md',
                          ptAsset: 'docs/TERMS.pt.md',
                          locale: Localizations.localeOf(context),
                        ),
                  ),
                ),
          ),
          ListTile(
            title: Text(loc.aboutSource),
            trailing: const Icon(Icons.open_in_new),
            onTap: () => _open(_sourceUrl),
          ),
          ListTile(
            title: Text(loc.aboutSupport),
            trailing: const Icon(Icons.favorite_border),
            onTap: () => _open(_supportUrl),
          ),
          const Divider(),
          ListTile(
            title: Text(loc.aboutShowWelcomeTour),
            trailing: const Icon(Icons.replay_outlined),
            onTap: () async {
              await ref
                  .read(settingsRepositoryProvider)
                  .saveHasSeenOnboarding(value: false);
              ref.read(onboardingNeededProvider.notifier).state = true;
              if (context.mounted) {
                Navigator.of(context).popUntil((route) => route.isFirst);
              }
            },
          ),
        ],
      ),
    );
  }
}
