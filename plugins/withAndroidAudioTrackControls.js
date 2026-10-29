const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const AUDIO_PLAYBACK_SERVICE = 'expo.modules.audio.service.AudioControlsService';

async function patchExpoAudio(projectRoot) {
  const audioRoot = path.join(
    projectRoot,
    'node_modules',
    'expo-audio',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'audio',
    'service'
  );
  const servicePath = path.join(audioRoot, 'AudioControlsService.kt');

  try {
    let service = await fs.readFile(servicePath, 'utf8');

    // 1. Add onTaskRemoved to dismiss notification and stop service when app is closed from recents
    if (!service.includes('override fun onTaskRemoved')) {
      const target = '  override fun onDestroy() {\n';
      const replacement =
        '  override fun onTaskRemoved(rootIntent: Intent?) {\n' +
        '    super.onTaskRemoved(rootIntent)\n' +
        '    clearSessionInternal()\n' +
        '    hideNotification()\n' +
        '    stopSelf()\n' +
        '  }\n\n' +
        '  override fun onDestroy() {\n' +
        '    clearSessionInternal()\n' +
        '    hideNotification()\n';

      if (service.includes(target)) {
        service = service.replace(target, replacement);
      }
    }

    // 2. Allow user to swipe away notification when paused (detach from foreground)
    if (!service.includes('STOP_FOREGROUND_DETACH')) {
      const playingTarget =
        '      override fun onIsPlayingChanged(isPlaying: Boolean) {\n' +
        '        updateSessionCustomLayout(isPlaying)\n' +
        '        postOrStartForegroundNotification(startInForeground = false)\n' +
        '      }\n';

      const playingReplacement =
        '      override fun onIsPlayingChanged(isPlaying: Boolean) {\n' +
        '        updateSessionCustomLayout(isPlaying)\n' +
        '        if (!isPlaying) {\n' +
        '          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {\n' +
        '            stopForeground(STOP_FOREGROUND_DETACH)\n' +
        '          } else {\n' +
        '            @Suppress("DEPRECATION")\n' +
        '            stopForeground(false)\n' +
        '          }\n' +
        '        }\n' +
        '        postOrStartForegroundNotification(startInForeground = isPlaying)\n' +
        '      }\n';

      if (service.includes(playingTarget)) {
        service = service.replace(playingTarget, playingReplacement);
      }
    }

    await fs.writeFile(servicePath, service, 'utf8');
  } catch (err) {
    console.warn('Could not patch expo-audio AudioControlsService:', err);
  }
}

module.exports = function withAndroidAudioTrackControls(config) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    if (!application.service) application.service = [];
    let playbackService = application.service.find(
      (service) => service.$?.['android:name'] === AUDIO_PLAYBACK_SERVICE
    );

    if (!playbackService) {
      playbackService = {
        $: {
          'android:name': AUDIO_PLAYBACK_SERVICE,
          'android:exported': 'false',
          'android:foregroundServiceType': 'mediaPlayback',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'androidx.media3.session.MediaSessionService',
                },
              },
            ],
          },
        ],
      };
      application.service.push(playbackService);
    }

    // Tells Android OS to notify and clean up the service when the app task is removed
    playbackService.$['android:stopWithTask'] = 'true';
    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      await patchExpoAudio(config.modRequest.projectRoot);
      return config;
    },
  ]);
};
