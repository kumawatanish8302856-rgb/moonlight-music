import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchSongs, songsErrorMessage, type Song } from './songs';

export type { Song };

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

// ---------- Audio engine (poori app mein ek hi player) ----------
export const player: AudioPlayer | null =
  typeof window === 'undefined' ? null : createAudioPlayer(null, { updateInterval: 500 });

if (player) {
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  }).catch(() => {});
}

let handledFinishFor = '';

function loadCurrent() {
  const song = state.queue[state.index];
  if (!song || !player) return;
  handledFinishFor = '';
  player.replace({ uri: song.audioUrl });
  player.play();
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
    let i = index;
    while (i === index) i = Math.floor(Math.random() * queue.length);
    return i;
  }
  if (index < queue.length - 1) return index + 1;
  return wrap ? 0 : null;
}

function onFinished() {
  if (!player) return;
  if (state.repeat) {
    handledFinishFor = '';
    player.seekTo(0).then(() => player.play());
    return;
  }
  const i = pickIndex(false);
  if (i !== null) {
    set({ index: i });
    loadCurrent();
  } else {
    player.pause();
    player.seekTo(0);
  }
}

player?.addListener('playbackStatusUpdate', (status) => {
  if (!status.didJustFinish) return;
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
      const songs = await fetchSongs();
      set({ songs, loading: false, loaded: true });
    } catch (error: unknown) {
      set({ loading: false, loaded: true, error: songsErrorMessage(error) });
    }
  },

  playQueue(queue: Song[], index: number) {
    if (!queue[index]) return;
    set({ queue, index });
    loadCurrent();
  },

  playShuffled(queue: Song[]) {
    if (queue.length === 0) return;
    set({ shuffle: true });
    playerStore.playQueue(queue, Math.floor(Math.random() * queue.length));
  },

  toggle() {
    if (state.index < 0 || !player) return;
    if (player.playing) {
      player.pause();
      return;
    }
    if (player.duration > 0 && player.currentTime >= player.duration - 0.5) {
      player.seekTo(0).then(() => player.play());
    } else {
      player.play();
    }
  },

  next() {
    const i = pickIndex(true);
    if (i === null) return;
    set({ index: i });
    loadCurrent();
  },

  prev() {
    if (state.index < 0 || !player) return;
    if (player.currentTime > 3 || state.index === 0) {
      player.seekTo(0);
      return;
    }
    set({ index: state.index - 1 });
    loadCurrent();
  },

  seek(seconds: number) {
    player?.seekTo(seconds);
  },

  toggleShuffle() {
    set({ shuffle: !state.shuffle });
  },

  toggleRepeat() {
    set({ repeat: !state.repeat });
  },

};

// ---------- React hooks ----------
export function useLibrary() {
  return useSyncExternalStore(subscribeLibrary, getLibrarySnapshot);
}

export function usePlayback() {
  const snapshot = useSyncExternalStore(subscribePlayback, getPlaybackSnapshot);
  const current = snapshot.index >= 0 ? snapshot.queue[snapshot.index] ?? null : null;
  return { ...snapshot, current };
}

// sirf tab re-render hota hai jab play/pause badle
export function usePlaying() {
  const [playing, setPlaying] = useState(player?.playing ?? false);
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener('playbackStatusUpdate', (s) => setPlaying(s.playing));
    return () => sub.remove();
  }, []);
  return playing;
}