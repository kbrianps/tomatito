import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:tomatito/core/motion/motion_curves.dart';
import 'package:tomatito/core/motion/motion_durations.dart';
import 'package:tomatito/core/theme/theme_tokens.dart';
import 'package:tomatito/data/settings_repository.dart';
import 'package:tomatito/l10n/app_localizations.dart';

/// True when the welcome tour should appear in front of RootShell.
/// Overridden by main() with `!hasSeenOnboarding`. Toggled to false when
/// the user finishes the tour, and back to true from About when they ask
/// to "Show welcome tour again".
final onboardingNeededProvider = StateProvider<bool>((ref) => false);

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final PageController _controller = PageController();
  int _index = 0;

  static const int _totalPages = 4;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _complete() async {
    await ref
        .read(settingsRepositoryProvider)
        .saveHasSeenOnboarding(value: true);
    ref.read(onboardingNeededProvider.notifier).state = false;
  }

  void _next() {
    if (_index >= _totalPages - 1) {
      _complete();
      return;
    }
    _controller.nextPage(
      duration: MotionDurations.emphasized,
      curve: MotionCurves.standard,
    );
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final pages = _buildPages(loc);
    final isLast = _index == _totalPages - 1;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: pages.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (ctx, i) => pages[i],
              ),
            ),
            _PageIndicators(currentIndex: _index, total: _totalPages),
            const SizedBox(height: ThemeTokens.space4),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                ThemeTokens.space5,
                0,
                ThemeTokens.space5,
                ThemeTokens.space5,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: _complete,
                    child: Text(
                      loc.onboardingSkip,
                      style: TextStyle(
                        color: theme.colorScheme.onSurface.withValues(
                          alpha: 0.7,
                        ),
                      ),
                    ),
                  ),
                  FilledButton(
                    onPressed: _next,
                    child: Text(
                      isLast ? loc.onboardingGetStarted : loc.onboardingNext,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildPages(AppLocalizations loc) => [
    _OnboardingPage(
      icon: Icons.local_florist_outlined,
      title: loc.appName,
      body: loc.tagline,
    ),
    _OnboardingPage(
      icon: Icons.flag_outlined,
      title: loc.onboardingGoalTitle,
      body: loc.onboardingGoalBody,
    ),
    _OnboardingPage(
      icon: Icons.psychology_outlined,
      title: loc.onboardingFocusTitle,
      body: loc.onboardingFocusBody,
    ),
    _OnboardingPage(
      icon: Icons.tune_outlined,
      title: loc.onboardingCustomizeTitle,
      body: loc.onboardingCustomizeBody,
    ),
  ];
}

class _OnboardingPage extends StatelessWidget {
  const _OnboardingPage({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: ThemeTokens.space6,
        vertical: ThemeTokens.space5,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 96, color: theme.colorScheme.primary),
          const SizedBox(height: ThemeTokens.space5),
          Text(
            title,
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineMedium,
          ),
          const SizedBox(height: ThemeTokens.space4),
          Text(
            body,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.75),
            ),
          ),
        ],
      ),
    );
  }
}

class _PageIndicators extends StatelessWidget {
  const _PageIndicators({required this.currentIndex, required this.total});

  final int currentIndex;
  final int total;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < total; i++)
          AnimatedContainer(
            duration: MotionDurations.standard,
            curve: MotionCurves.standard,
            margin: const EdgeInsets.symmetric(horizontal: 4),
            width: i == currentIndex ? 24 : 8,
            height: 8,
            decoration: BoxDecoration(
              color:
                  i == currentIndex
                      ? scheme.primary
                      : scheme.onSurface.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
      ],
    );
  }
}
