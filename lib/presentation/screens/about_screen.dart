import 'package:flutter/material.dart';

import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/l10n/app_localizations.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  static const _version = '0.1.0';

  @override
  Widget build(BuildContext context) {
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
          Card(
            child: ExpansionTile(
              title: Text(loc.aboutWhyTheseNumbers),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    ThemeTokens.space4,
                    0,
                    ThemeTokens.space4,
                    ThemeTokens.space4,
                  ),
                  child: Text(
                    loc.aboutWhyTheseNumbersBody,
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: ThemeTokens.space4),
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
            enabled: false,
          ),
          ListTile(
            title: Text(loc.aboutTerms),
            trailing: const Icon(Icons.chevron_right),
            enabled: false,
          ),
          ListTile(
            title: Text(loc.aboutSource),
            trailing: const Icon(Icons.open_in_new),
            enabled: false,
          ),
          ListTile(
            title: Text(loc.aboutSupport),
            trailing: const Icon(Icons.favorite_border),
            enabled: false,
          ),
        ],
      ),
    );
  }
}
