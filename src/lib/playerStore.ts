import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { hapticLight, hapticMedium, hapticSelection } from './haptics';
import { fetchSongs, songsErrorMessage, type Song } from './songs';
import { recordSongPlayed, recordToSong, useRecentlyPlayed, clearRecentlyPlayed, type RecentlyPlayedRecord } from './recentlyPlayed';
import {
  toggleLikeSong,
  unlikeSong,
  clearLikedSongs,
  useLikedSongs,
  useIsSongLiked,
  isSongLiked,
  type LikedSong,
} from './likedSongs';

export type { Song, RecentlyPlayedRecord, LikedSong };
export {
  recordToSong,
  useRecentlyPlayed,
  clearRecentlyPlayed,
  toggleLikeSong,
  unlikeSong,
  clearLikedSongs,
  useLikedSongs,
  useIsSongLiked,
  isSongLiked,
};

type State = {
  songs: Song[];
  loading: boolean;
  loaded: boolean;
  error: string;
  queue: Song[];
  index: number;
  shuffle: boolean;
  repeat: boolean;
};

type LibrarySnapshot = Pick<State, 'songs' | 'loading' | 'loaded' | 'error'>;
type PlaybackSnapshot = Pick<State, 'queue' | 'index' | 'shuffle' | 'repeat'>;

let state: State = {
  songs: [],
  loading: false,
  loaded: false,
  error: '',
  queue: [],
  index: -1,
  shuffle: false,
  repeat: false,
};

const listeners = new Set<() => void>();
const libraryListeners = new Set<() => void>();
const playbackListeners = new Set<() => void>();

let librarySnapshot: LibrarySnapshot = {
  songs: state.songs,
  loading: state.loading,
  loaded: state.loaded,
  error: state.error,
};
let playbackSnapshot: PlaybackSnapshot = {
  queue: state.queue,
  index: state.index,
  shuffle: state.shuffle,
  repeat: state.repeat,
};

function subscribeLibrary(listener: () => void) {
  libraryListeners.add(listener);
  return () => libraryListeners.delete(listener);
}

function subscribePlayback(listener: () => void) {
  playbackListeners.add(listener);
  return () => playbackListeners.delete(listener);
}

function getLibrarySnapshot() {
  return librarySnapshot;
}

function getPlaybackSnapshot() {
  return playbackSnapshot;
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch };

  if ('songs' in patch || 'loading' in patch || 'loaded' in patch || 'error' in patch) {
    librarySnapshot = {
      songs: state.songs,
      loading: state.loading,
      loaded: state.loaded,
      error: state.error,
    };
    libraryListeners.forEach((l) => l());
  }

  if (
    'queue' in patch ||
    'index' in patch ||
    'shuffle' in patch ||
    'repeat' in patch
  ) {
    playbackSnapshot = {
      queue: state.queue,
      index: state.index,
      shuffle: state.shuffle,
      repeat: state.repeat,
    };
    playbackListeners.forEach((l) => l());
  }

  listeners.forEach((l) => l());
}

// ---------- Audio engine (single global player instance) ----------
export const player: AudioPlayer | null =
  typeof window === 'undefined' ? null : createAudioPlayer(null, { updateInterval: 500 });

// Ensure Web Audio onended properly emits status update so tracks auto-advance
if (player && Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    const proto = Object.getPrototypeOf(player);
    if (proto && typeof proto._createMediaElement === 'function' && !(proto as any).__patchedEnded) {
      (proto as any).__patchedEnded = true;
      const origCreate = proto._createMediaElement;
      proto._createMediaElement = function () {
        const media: HTMLAudioElement = origCreate.call(this);
        media.addEventListener('ended', () => {
          this.emit('playbackStatusUpdate', {
            ...this.currentStatus,
            didJustFinish: true,
            playing: false,
          });
        });
        return media;
      };
    }
  } catch {}
}

if (player) {
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  }).catch(() => {});
}

let handledFinishFor = '';
let recordedPlaybackFor = '';

function safePlay() {
  if (!player) return;
  try {
    const res: unknown = player.play();
    if (res && typeof (res as { catch?: unknown }).catch === 'function') {
      (res as { catch: (fn: () => void) => void }).catch(() => {});
    }
  } catch {}
}

function loadCurrent() {
  const song = state.queue[state.index];
  if (!song || !player) return;
  handledFinishFor = '';
  recordedPlaybackFor = '';
  try {
    player.replace({ uri: song.audioUrl });
    safePlay();
  } catch (err) {
    console.warn('Playback error:', err);
  }
  try {
    player.setActiveForLockScreen(true, {
      title: song.title,
      artist: song.artist,
      albumTitle: 'Moonlight',
      ...(song.coverUrl ? { artworkUrl: song.coverUrl } : {}),
    });
  } catch {}
}

function pickIndex(wrap: boolean): number | null {
  const { queue, index, shuffle } = state;
  if (queue.length === 0) return null;
  if (shuffle && queue.length > 1) {
    const offset = 1 + Math.floor(Math.random() * (queue.length - 1));
    return (index + offset) % queue.length;
  }
  if (index < queue.length - 1) return index + 1;
  return wrap ? 0 : null;
}

function onFinished() {
  if (!player) return;
  if (state.repeat) {
    handledFinishFor = '';
    player.seekTo(0).then(() => safePlay()).catch(() => {});
    return;
  }
  const i = pickIndex(false);
  if (i !== null) {
    set({ index: i });
    loadCurrent();
  } else {
    player.pause();
    player.seekTo(0).catch(() => {});
  }
}

player?.addListener('playbackStatusUpdate', (status) => {
  // Record to Recently Played only when playback genuinely begins
  if (status.isLoaded && status.playing && !status.error) {
    const cur = state.queue[state.index];
    if (cur && cur.id && recordedPlaybackFor !== cur.id) {
      recordedPlaybackFor = cur.id;
      void recordSongPlayed(cur);
    }
  }

  const isFinished =
    status.didJustFinish ||
    (status.isLoaded &&
      status.duration > 0 &&
      status.currentTime >= status.duration - 0.5 &&
      !status.playing);
  if (!isFinished) return;
  const cur = state.queue[state.index];
  if (!cur || handledFinishFor === cur.id) return;
  handledFinishFor = cur.id;
  onFinished();
});

// ---------- Store ----------
export const playerStore = {
  getState: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },

  async loadSongs(force = false) {
    if (state.loading || (state.loaded && !force)) return;
    set({ loading: true, error: '' });
    try {
      const songs = await fetchSongs({ force });
      set({ songs, loading: false, loaded: true });
    } catch (error: unknown) {
      set({ loading: false, loaded: true, error: songsErrorMessage(error) });
    }
  },

  playQueue(queue: Song[], index: number) {
    if (!queue[index]) return;
    hapticLight();
    set({ queue, index });
    loadCurrent();
  },

  playShuffled(queue: Song[]) {
    if (queue.length === 0) return;
    hapticSelection();
    set({ shuffle: true });
    playerStore.playQueue(queue, Math.floor(Math.random() * queue.length));
  },

  toggle() {
    if (state.index < 0 || !player) return;
    hapticMedium();
    if (player.playing) {
      player.pause();
      return;
    }
    if (player.duration > 0 && player.currentTime >= player.duration - 0.5) {
      player.seekTo(0).then(() => safePlay()).catch(() => {});
    } else {
      safePlay();
    }
  },

  next() {
    const i = pickIndex(true);
    if (i === null) return;
    hapticLight();
    set({ index: i });
    loadCurrent();
  },

  prev() {
    if (state.index < 0 || !player) return;
    hapticLight();
    if (player.currentTime > 3 || state.index === 0) {
      player.seekTo(0).catch(() => {});
      return;
    }
    set({ index: state.index - 1 });
    loadCurrent();
  },

  seek(seconds: number) {
    player?.seekTo(seconds).catch(() => {});
  },

  seekBy(deltaSeconds: number) {
    if (!player) return;
    const cur = player.currentTime || 0;
    const dur = player.duration || 0;
    const target = Math.max(
      0,
      dur > 0 ? Math.min(dur, cur + deltaSeconds) : Math.max(0, cur + deltaSeconds)
    );
    player.seekTo(target).catch(() => {});
  },

  toggleShuffle() {
    hapticSelection();
    set({ shuffle: !state.shuffle });
  },

  toggleRepeat() {
    hapticSelection();
    set({ repeat: !state.repeat });
  },
};

if (typeof window !== 'undefined') {
  (window as any).__playerStore = playerStore;
  (window as any).__player = player;
}

if (player && Platform.OS === 'android') {
  player.addListener('lockScreenPreviousTrack', () => playerStore.prev());
  player.addListener('lockScreenNextTrack', () => playerStore.next());
}

if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('previoustrack', () => playerStore.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => playerStore.next());
  } catch {}
}

// ---------- React hooks ----------
export function useLibrary() {
  return useSyncExternalStore(subscribeLibrary, getLibrarySnapshot);
}

export function usePlayback() {
  const snapshot = useSyncExternalStore(subscribePlayback, getPlaybackSnapshot);
  const current = snapshot.index >= 0 ? snapshot.queue[snapshot.index] ?? null : null;
  return { ...snapshot, current };
}

function subscribePlaying(callback: () => void) {
  if (!player) return () => {};
  const sub = player.addListener('playbackStatusUpdate', callback);
  return () => sub.remove();
}

function getPlayingSnapshot() {
  return player?.playing ?? false;
}

// Re-renders only when play/pause status changes without cascading effect renders
export function usePlaying() {
  return useSyncExternalStore(subscribePlaying, getPlayingSnapshot, () => false);
}
