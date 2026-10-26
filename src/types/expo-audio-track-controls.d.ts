import 'expo-audio';
import type { AudioEvents } from 'expo-audio';

declare module 'expo-audio' {
  interface AudioPlayer {
    addListener<EventName extends keyof AudioEvents | LockScreenTrackEvent>(
      eventName: EventName,
      listener: EventName extends keyof AudioEvents ? AudioEvents[EventName] : () => void
    ): { remove(): void };
  }
}

type LockScreenTrackEvent = 'lockScreenPreviousTrack' | 'lockScreenNextTrack';
