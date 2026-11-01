import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import type { Song } from './songs';

export const YOUTUBE_HISTORY_KEY = 'moonlight_yt_history_v1';
export const MAX_YOUTUBE_HISTORY = 50;

export type YouTubeHistorySong = Song & {
  playedAt: number;
};

let cachedHistory: YouTubeHistorySong[] = [];
let isLoaded = false;
let loadPromise: Promise<YouTubeHistorySong[]> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export async function getYouTubeHistory(force = false): Promise<YouTubeHistorySong[]> {
  if (isLoaded && !force) return cachedHistory;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(YOUTUBE_HISTORY_KEY);
      if (!raw) {
        cachedHistory = [];
        isLoaded = true;
        notify();
        return [];
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        cachedHistory = [];
        isLoaded = true;
        notify();
        return [];
      }

      if (!Array.isArray(parsed)) {
        cachedHistory = [];
        isLoaded = true;
        notify();
        return [];
      }

      const valid: YouTubeHistorySong[] = [];
      const seen = new Set<string>();

      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const id = typeof rec.id === 'string' ? rec.id.trim() : '';
        if (!id || seen.has(id)) continue;
        seen.add(id);

        valid.push({
          id,
          title: typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : 'Untitled',
          artist: typeof rec.artist === 'string' ? rec.artist.trim() : 'Unknown Artist',
          audioUrl: typeof rec.audioUrl === 'string' ? rec.audioUrl : '',
          coverUrl: typeof rec.coverUrl === 'string' ? rec.coverUrl : undefined,
          thumb: typeof rec.thumb === 'string' ? rec.thumb : undefined,
          source: 'youtube',
          playedAt: typeof rec.playedAt === 'number' && Number.isFinite(rec.playedAt) ? rec.playedAt : Date.now(),
        });

        if (valid.length >= MAX_YOUTUBE_HISTORY) break;
      }

      cachedHistory = valid;
      isLoaded = true;
      notify();
      return valid;
    } catch {
      cachedHistory = [];
      isLoaded = true;
      notify();
      return [];
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

let saveQueue: Promise<void> = Promise.resolve();

export function recordYouTubeSong(song: Song): Promise<void> {
  if (!song || !song.id) {
    return Promise.resolve();
  }
  const songId = song.id.trim();
  if (!songId) return Promise.resolve();

  const perform = async () => {
    if (!isLoaded) {
      await getYouTubeHistory();
    }

    const newRecord: YouTubeHistorySong = {
      id: songId,
      title: song.title || 'Untitled',
      artist: song.artist || 'Unknown Artist',
      audioUrl: song.audioUrl,
      coverUrl: song.coverUrl,
      thumb: song.thumb ?? song.coverUrl,
      source: 'youtube',
      playedAt: Date.now(),
    };

    // Remove any older duplicate entry for the same songId
    const filtered = cachedHistory.filter((item) => item.id !== songId);

    // Put newest at front
    const updated = [newRecord, ...filtered].slice(0, MAX_YOUTUBE_HISTORY);

    cachedHistory = updated;
    notify();

    try {
      await AsyncStorage.setItem(YOUTUBE_HISTORY_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('[YouTubeHistory] Failed to persist history:', err);
    }
  };

  saveQueue = saveQueue.then(perform, perform);
  return saveQueue;
}

export async function clearYouTubeHistory(): Promise<void> {
  cachedHistory = [];
  notify();
  try {
    await AsyncStorage.removeItem(YOUTUBE_HISTORY_KEY);
  } catch (err) {
    console.warn('[YouTubeHistory] Failed to clear history:', err);
  }
}

export function useYouTubeHistory(): YouTubeHistorySong[] {
  useEffect(() => {
    if (!isLoaded) {
      void getYouTubeHistory();
    }
  }, []);

  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    () => cachedHistory
  );
}
