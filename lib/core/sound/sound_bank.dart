import 'package:meta/meta.dart' show immutable;

/// One option in the chime picker. The `nameKey` resolves to a localised
/// label via AppLocalizations (e.g., `soundSoftBell`).
@immutable
class SoundOption {
  const SoundOption({
    required this.id,
    required this.assetPath,
    required this.nameKey,
  });

  final String id;
  final String assetPath;
  final String nameKey;

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is SoundOption && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

/// Registry of bundled chimes. Each file is a small (< 10 KB) royalty-free
/// OGG Vorbis tone generated locally with ffmpeg; see DEVELOPMENT.md for the
/// generation recipes. Adding a new sound is one entry plus one .ogg file.
final class SoundBank {
  const SoundBank._();

  static const SoundOption softBell = SoundOption(
    id: 'soft_bell',
    assetPath: 'assets/sounds/chime_soft_bell.ogg',
    nameKey: 'soundSoftBell',
  );

  static const SoundOption woodBlock = SoundOption(
    id: 'wood_block',
    assetPath: 'assets/sounds/chime_wood_block.ogg',
    nameKey: 'soundWoodBlock',
  );

  static const SoundOption gentlePulse = SoundOption(
    id: 'gentle_pulse',
    assetPath: 'assets/sounds/chime_gentle_pulse.ogg',
    nameKey: 'soundGentlePulse',
  );

  static const List<SoundOption> all = [softBell, woodBlock, gentlePulse];

  static SoundOption defaultOption = softBell;

  static SoundOption byId(String id) {
    return all.firstWhere((o) => o.id == id, orElse: () => defaultOption);
  }
}
