import 'package:flutter/material.dart';
import 'package:tomatito/core/theme/app_themes.dart';
import 'package:tomatito/l10n/app_localizations.dart';

class TomatitoApp extends StatelessWidget {
  const TomatitoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      onGenerateTitle: (ctx) => AppLocalizations.of(ctx).appName,
      theme: AppThemes.themeFor(AppThemeId.tomatito),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const _Phase0Placeholder(),
    );
  }
}

class _Phase0Placeholder extends StatelessWidget {
  const _Phase0Placeholder();

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(loc.appName, style: theme.textTheme.headlineLarge),
            const SizedBox(height: 8),
            Text(
              loc.tagline,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 32),
            Text(loc.scaffoldPlaceholder, style: theme.textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}
