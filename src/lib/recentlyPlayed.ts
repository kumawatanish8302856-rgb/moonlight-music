import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import type { Song } from './songs';

export const RECENTLY_PLAYED_KEY = 'moonlight_recently_played_v1';
export const MAX_RECENTLY_PLAYED = 20;

export type RecentlyPlayedRecord = {
  songId: string;
  title: string;
  artist?: string;
  artwork?: string;
  audioUrl: string;
  coverUrl?: string;
  thumb?: string;
  playedAt: number; // Unix epoch ms
};

let cachedHistory: RecentlyPlayedRecord[] = [];
let isLoaded = false;
let loadPromise: Promise<RecentlyPlayedRecord[]> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export function recordToSong(record: RecentlyPlayedRecord, liveSongs?: Song[]): Song {
  // If the live library is available, prefer the current metadata while keeping identity
  if (liveSongs && liveSongs.length > 0) {
    const live = liveSongs.find((s) => s.id === record.songId);
    if (live) return live;
  }

  return {
    id: record.songId,
    title: record.title || 'Untitled',
    artist: record.artist || 'Unknown',
    audioUrl: record.audioUrl,
    coverUrl: record.coverUrl ?? record.artwork,
    thumb: record.thumb ?? record.artwork,
  };
}

export async function getRecentlyPlayed(force = false): Promise<RecentlyPlayedRecord[]> {
  if (isLoaded && !force) return cachedHistory;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENTLY_PLAYED_KEY);
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
        console.warn('[RecentlyPlayed] Corrupted history JSON; resetting.');
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

      const valid: RecentlyPlayedRecord[] = [];
      const seen = new Set<string>();

      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const songId =
          typeof rec.songId === 'string'
            ? rec.songId.trim()
            : typeof rec.id === 'string'
            ? rec.id.trim()
            : '';

        if (!songId || seen.has(songId)) continue;
        seen.add(songId);

        valid.push({
          songId,
          title: typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : 'Untitled',
          artist: typeof rec.artist === 'string' ? rec.artist.trim() : 'Unknown',
          artwork:
            typeof rec.artwork === 'string'
              ? rec.artwork
              : typeof rec.coverUrl === 'string'
              ? rec.coverUrl
              : typeof rec.thumb === 'string'
              ? rec.thumb
              : undefined,
          audioUrl: typeof rec.audioUrl === 'string' ? rec.audioUrl : '',
          coverUrl: typeof rec.coverUrl === 'string' ? rec.coverUrl : undefined,
          thumb: typeof rec.thumb === 'string' ? rec.thumb : undefined,
          playedAt:
            typeof rec.playedAt === 'number' && Number.isFinite(rec.playedAt)
              ? rec.playedAt
              : Date.now(),
        });

        if (valid.length >= MAX_RECENTLY_PLAYED) break;
      }

      cachedHistory = valid;
      isLoaded = true;
      notify();
      return valid;
    } catch (err) {
      console.warn('[RecentlyPlayed] Failed to load history:', err);
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

export function recordSongPlayed(song: Song): Promise<void> {
  if (!song || !song.id || typeof song.id !== 'string') {
    return Promise.resolve();
  }
  const songId = song.id.trim();
  if (!songId) return Promise.resolve();

  const perform = async () => {
    if (!isLoaded) {
      await getRecentlyPlayed();
    }

    const newRecord: RecentlyPlayedRecord = {
      songId,
      title: song.title || 'Untitled',
      artist: song.artist || 'Unknown',
      artwork: song.coverUrl ?? song.thumb,
      audioUrl: song.audioUrl,
      coverUrl: song.coverUrl,
      thumb: song.thumb,
      playedAt: Date.now(),
    };

    // Remove any older duplicate entry for the same songId
    const filtered = cachedHistory.filter((item) => item.songId !== songId);

    // Put at top (newest-first) and limit to max 20
    const updated = [newRecord, ...filtered].slice(0, MAX_RECENTLY_PLAYED);

    cachedHistory = updated;
    notify();

    try {
      await AsyncStorage.setItem(RECENTLY_PLAYED_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('[RecentlyPlayed] Failed to persist history:', err);
    }
  };

  saveQueue = saveQueue.then(perform, perform);
  return saveQueue;
}

export async function clearRecentlyPlayed(): Promise<void> {
  cachedHistory = [];
  notify();
  try {
    await AsyncStorage.removeItem(RECENTLY_PLAYED_KEY);
  } catch (err) {
    console.warn('[RecentlyPlayed] Failed to clear history:', err);
  }
}

export function useRecentlyPlayed(): RecentlyPlayedRecord[] {
  useEffect(() => {
    if (!isLoaded) {
      void getRecentlyPlayed();
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
