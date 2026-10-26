const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const AUDIO_PLAYBACK_SERVICE = 'expo.modules.audio.service.AudioControlsService';

function replaceRequired(source, original, replacement, file) {
  if (source.includes(replacement)) return source;
  if (!source.includes(original)) {
    throw new Error(`Could not apply Android audio track controls patch to ${file}.`);
  }
  return source.replace(original, replacement);
}

function replaceAllRequired(source, original, replacement, file) {
  if (!source.includes(original) && source.includes(replacement)) return source;
  if (!source.includes(original)) {
    throw new Error(`Could not apply Android audio track controls patch to ${file}.`);
  }
  return source.split(original).join(replacement);
}

async function patchExpoAudio(projectRoot) {
  const audioRoot = path.join(projectRoot, 'node_modules', 'expo-audio', 'android', 'src', 'main', 'java', 'expo', 'modules', 'audio', 'service');
  const servicePath = path.join(audioRoot, 'AudioControlsService.kt');
  const callbackPath = path.join(audioRoot, 'AudioMediaSessionCallback.kt');
  let service = await fs.readFile(servicePath, 'utf8');
  let callback = await fs.readFile(callbackPath, 'utf8');

  service = replaceRequired(
    service,
    '        ACTION_SEEK_BACKWARD -> currentPlayerRef.seekTo(currentPlayerRef.currentPosition - SEEK_INTERVAL_MS)\n',
    '        ACTION_SEEK_BACKWARD -> currentPlayerRef.seekTo(currentPlayerRef.currentPosition - SEEK_INTERVAL_MS)\n' +
      '        ACTION_SKIP_PREVIOUS -> dispatchTrackAction(LOCK_SCREEN_PREVIOUS_TRACK_EVENT)\n' +
      '        ACTION_SKIP_NEXT -> dispatchTrackAction(LOCK_SCREEN_NEXT_TRACK_EVENT)\n',
    servicePath
  );
  service = replaceRequired(
    service,
    '  private fun shouldPlayInSilentMode(): Boolean {\n',
    '  private fun dispatchTrackAction(eventName: String) {\n' +
      '    appContext?.mainQueue?.launch { currentPlayer?.emit(eventName) }\n' +
      '  }\n\n' +
      '  private fun shouldPlayInSilentMode(): Boolean {\n',
    servicePath
  );
  service = replaceRequired(
    service,
    '      builder.addAction(\n' +
      '        NotificationCompat.Action(\n' +
      '          if (session.player.isPlaying) {\n',
    '      builder.addAction(\n' +
      '        NotificationCompat.Action(\n' +
      '          android.R.drawable.ic_media_previous,\n' +
      '          "Previous track",\n' +
      '          buildActionPendingIntent(ACTION_SKIP_PREVIOUS)\n' +
      '        )\n' +
      '      )\n' +
      '      compactViewIndices.add(currentIndex)\n' +
      '      currentIndex++\n\n' +
      '      builder.addAction(\n' +
      '        NotificationCompat.Action(\n' +
      '          if (session.player.isPlaying) {\n',
    servicePath
  );
  service = replaceRequired(
    service,
    '      if (currentOptions?.showSeekForward == true) {\n',
    '      builder.addAction(\n' +
      '        NotificationCompat.Action(\n' +
      '          android.R.drawable.ic_media_next,\n' +
      '          "Next track",\n' +
      '          buildActionPendingIntent(ACTION_SKIP_NEXT)\n' +
      '        )\n' +
      '      )\n' +
      '      compactViewIndices.add(currentIndex)\n' +
      '      currentIndex++\n\n' +
      '      if (currentOptions?.showSeekForward == true) {\n',
    servicePath
  );
  service = replaceAllRequired(
    service,
    '        compactViewIndices.add(currentIndex)\n        currentIndex++\n',
    '        currentIndex++\n',
    servicePath
  );
  const forwardSeekCompactIndex =
    '        compactViewIndices.add(currentIndex)\n      }\n\n      style.setShowActionsInCompactView';
  if (service.includes(forwardSeekCompactIndex)) {
    service = service.replace(
      forwardSeekCompactIndex,
      '      }\n\n      style.setShowActionsInCompactView'
    );
  } else if (!service.includes('      }\n\n      style.setShowActionsInCompactView')) {
    throw new Error(`Could not apply Android audio track controls patch to ${servicePath}.`);
  }
  service = replaceRequired(
    service,
    '    // Add seek backward button if enabled\n',
    '    mediaButtons.add(\n' +
      '      CommandButton.Builder(CommandButton.ICON_PREVIOUS)\n' +
      '        .setDisplayName("Previous track")\n' +
      '        .setEnabled(true)\n' +
      '        .setSessionCommand(SessionCommand(ACTION_SKIP_PREVIOUS, Bundle.EMPTY))\n' +
      '        .setSlots(CommandButton.SLOT_BACK)\n' +
      '        .build()\n' +
      '    )\n\n' +
      '    // Add seek backward button if enabled\n',
    servicePath
  );
  service = replaceRequired(
    service,
    '    // Add seek forward button if enabled\n',
    '    mediaButtons.add(\n' +
      '      CommandButton.Builder(CommandButton.ICON_NEXT)\n' +
      '        .setDisplayName("Next track")\n' +
      '        .setEnabled(true)\n' +
      '        .setSessionCommand(SessionCommand(ACTION_SKIP_NEXT, Bundle.EMPTY))\n' +
      '        .setSlots(CommandButton.SLOT_FORWARD)\n' +
      '        .build()\n' +
      '    )\n\n' +
      '    // Add seek forward button if enabled\n',
    servicePath
  );
  service = replaceAllRequired(
    service,
    '.setCallback(AudioMediaSessionCallback())',
    '.setCallback(\n' +
      '            AudioMediaSessionCallback(\n' +
      '              onSkipPrevious = { dispatchTrackAction(LOCK_SCREEN_PREVIOUS_TRACK_EVENT) },\n' +
      '              onSkipNext = { dispatchTrackAction(LOCK_SCREEN_NEXT_TRACK_EVENT) }\n' +
      '            )\n' +
      '          )',
    servicePath
  );
  service = replaceRequired(
    service,
    '    const val ACTION_SEEK_BACKWARD = "expo.modules.audio.action.SEEK_BACKWARD"\n',
    '    const val ACTION_SEEK_BACKWARD = "expo.modules.audio.action.SEEK_BACKWARD"\n' +
      '    const val ACTION_SKIP_PREVIOUS = "expo.modules.audio.action.SKIP_PREVIOUS"\n' +
      '    const val ACTION_SKIP_NEXT = "expo.modules.audio.action.SKIP_NEXT"\n' +
      '    const val LOCK_SCREEN_PREVIOUS_TRACK_EVENT = "lockScreenPreviousTrack"\n' +
      '    const val LOCK_SCREEN_NEXT_TRACK_EVENT = "lockScreenNextTrack"\n',
    servicePath
  );

  callback = replaceRequired(
    callback,
    'class AudioMediaSessionCallback : MediaSession.Callback {\n',
    'class AudioMediaSessionCallback(\n' +
      '  private val onSkipPrevious: () -> Unit,\n' +
      '  private val onSkipNext: () -> Unit\n' +
      ') : MediaSession.Callback {\n',
    callbackPath
  );
  callback = replaceRequired(
    callback,
    '            .add(SessionCommand(AudioControlsService.ACTION_SEEK_FORWARD, Bundle.EMPTY))\n',
    '            .add(SessionCommand(AudioControlsService.ACTION_SEEK_FORWARD, Bundle.EMPTY))\n' +
      '            .add(SessionCommand(AudioControlsService.ACTION_SKIP_PREVIOUS, Bundle.EMPTY))\n' +
      '            .add(SessionCommand(AudioControlsService.ACTION_SKIP_NEXT, Bundle.EMPTY))\n',
    callbackPath
  );
  callback = replaceRequired(
    callback,
    '    when (command.customAction) {\n',
    '    when (command.customAction) {\n' +
      '      AudioControlsService.ACTION_SKIP_PREVIOUS -> onSkipPrevious()\n' +
      '      AudioControlsService.ACTION_SKIP_NEXT -> onSkipNext()\n',
    callbackPath
  );

  await fs.writeFile(servicePath, service);
  await fs.writeFile(callbackPath, callback);
}

module.exports = function withAndroidAudioTrackControls(config) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('Could not find the Android application manifest entry.');
    }

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
