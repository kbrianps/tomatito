import 'package:audioplayers/audioplayers.dart' as ap;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';

import 'package:tomatito/core/sound/sound_bank.dart';

/// Plays a [SoundOption] from the bundled assets. Volume is in [0.0 .. 1.0]
/// and clamped on the way in. Implementations must be safe to call from any
/// thread and must not throw on missing audio backends; on platforms where
/// audio is not yet wired (e.g., headless test environments), use
/// [NoOpSoundPlayer].
abstract class SoundPlayer {
  Future<void> play(SoundOption option, {double volume = 0.6});
  Future<void> dispose();
}

class NoOpSoundPlayer implements SoundPlayer {
  NoOpSoundPlayer();

  @override
  Future<void> play(SoundOption option, {double volume = 0.6}) async {}

  @override
  Future<void> dispose() async {}
}

/// Production sound player backed by `just_audio`. Reuses a single
/// `AudioPlayer` instance; sets the asset and volume per call. just_audio
/// runs on Android, iOS, macOS, Linux, Windows and Web; on platforms that
/// fail to initialise, swap in [NoOpSoundPlayer] in `main()`.
class JustAudioSoundPlayer implements SoundPlayer {
  JustAudioSoundPlayer();

  final AudioPlayer _player = AudioPlayer();

  @override
  Future<void> play(SoundOption option, {double volume = 0.6}) async {
    final clamped = volume.clamp(0.0, 1.0);
    try {
      await _player.setVolume(clamped);
      await _player.setAsset(option.assetPath);
      await _player.play();
    } on Object {
      // Intentionally swallowed: a missing or broken audio backend must not
      // crash the timer. End-of-period notification still fires via the
      // NotificationService path on Android.
    }
  }

  @override
  Future<void> dispose() => _player.dispose();
}

/// Sound player backed by `audioplayers`. Used on Linux where `just_audio`
/// has no native implementation (calls silently no-op). `audioplayers`
/// ships a GStreamer-backed Linux runner. The asset path is the same flat
/// `assets/sounds/foo.ogg` string used everywhere; `audioplayers` strips
/// the `assets/` prefix internally via `AssetSource`.
class AudioplayersSoundPlayer implements SoundPlayer {
  AudioplayersSoundPlayer();

  final ap.AudioPlayer _player = ap.AudioPlayer();

  @override
  Future<void> play(SoundOption option, {double volume = 0.6}) async {
    final clamped = volume.clamp(0.0, 1.0);
    try {
      await _player.setVolume(clamped);
      // AssetSource expects the path relative to the assets root, without
      // the leading `assets/` segment.
      const prefix = 'assets/';
      final assetPath = option.assetPath.startsWith(prefix)
          ? option.assetPath.substring(prefix.length)
          : option.assetPath;
      await _player.stop();
      await _player.play(ap.AssetSource(assetPath));
    } on Object {
      // Same swallow rationale as JustAudioSoundPlayer: missing GStreamer
      // plugins on the host must not crash the timer.
    }
  }

  @override
  Future<void> dispose() => _player.dispose();
}

/// Override in `main()` with the platform-appropriate implementation.
final soundPlayerProvider = Provider<SoundPlayer>((ref) {
  throw UnimplementedError(
    'soundPlayerProvider has no binding. Override it in main().',
  );
});
