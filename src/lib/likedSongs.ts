import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import type { Song } from './songs';

export const LIKED_SONGS_KEY = 'moonlight_liked_songs_v1';

export type LikedSong = Song & {
  likedAt?: number;
};

let cachedLikedSongs: LikedSong[] = [];
let isLoaded = false;
let loadPromise: Promise<LikedSong[]> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export async function getLikedSongs(force = false): Promise<LikedSong[]> {
  if (isLoaded && !force) return cachedLikedSongs;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(LIKED_SONGS_KEY);
      if (!raw) {
        cachedLikedSongs = [];
        isLoaded = true;
        notify();
        return [];
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn('[LikedSongs] Corrupted liked songs JSON; resetting.');
        cachedLikedSongs = [];
        isLoaded = true;
        notify();
        return [];
      }

      if (!Array.isArray(parsed)) {
        cachedLikedSongs = [];
        isLoaded = true;
        notify();
        return [];
      }

      const valid: LikedSong[] = [];
      const seen = new Set<string>();

      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const id =
          typeof rec.id === 'string'
            ? rec.id.trim()
            : typeof rec.songId === 'string'
            ? rec.songId.trim()
            : '';

        if (!id || seen.has(id)) continue;
        seen.add(id);

        valid.push({
          id,
          title: typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : 'Untitled',
          artist: typeof rec.artist === 'string' ? rec.artist.trim() : 'Unknown',
          audioUrl: typeof rec.audioUrl === 'string' ? rec.audioUrl : '',
          coverUrl: typeof rec.coverUrl === 'string' ? rec.coverUrl : undefined,
          thumb: typeof rec.thumb === 'string' ? rec.thumb : undefined,
          likedAt:
            typeof rec.likedAt === 'number' && Number.isFinite(rec.likedAt)
              ? rec.likedAt
              : Date.now(),
        });
      }

      cachedLikedSongs = valid;
      isLoaded = true;
      notify();
      return valid;
    } catch (err) {
      console.warn('[LikedSongs] Failed to load liked songs:', err);
      cachedLikedSongs = [];
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

function persist(): Promise<void> {
  const perform = async () => {
    try {
      await AsyncStorage.setItem(LIKED_SONGS_KEY, JSON.stringify(cachedLikedSongs));
    } catch (err) {
      console.warn('[LikedSongs] Failed to persist liked songs:', err);
    }
  };
  saveQueue = saveQueue.then(perform, perform);
  return saveQueue;
}

export function isSongLiked(songId?: string | null): boolean {
  if (!songId) return false;
  const id = songId.trim();
  return cachedLikedSongs.some((s) => s.id === id);
}

export async function toggleLikeSong(song: Song): Promise<boolean> {
  if (!song || !song.id) return false;
  const id = song.id.trim();
  if (!id) return false;

  if (!isLoaded) {
    await getLikedSongs();
  }

  const existingIndex = cachedLikedSongs.findIndex((s) => s.id === id);
  let nowLiked = false;

  if (existingIndex >= 0) {
    // Remove from liked
    cachedLikedSongs = cachedLikedSongs.filter((s) => s.id !== id);
    nowLiked = false;
  } else {
    // Add to liked (newest-first)
    const newLiked: LikedSong = {
      id: song.id,
      title: song.title || 'Untitled',
      artist: song.artist || 'Unknown',
      audioUrl: song.audioUrl,
      coverUrl: song.coverUrl,
      thumb: song.thumb,
      likedAt: Date.now(),
    };
    cachedLikedSongs = [newLiked, ...cachedLikedSongs];
    nowLiked = true;
  }

  notify();
  await persist();
  return nowLiked;
}

export async function unlikeSong(songId: string): Promise<void> {
  if (!songId) return;
  const id = songId.trim();
  if (!isLoaded) {
    await getLikedSongs();
  }
  cachedLikedSongs = cachedLikedSongs.filter((s) => s.id !== id);
  notify();
  await persist();
}

export async function clearLikedSongs(): Promise<void> {
  cachedLikedSongs = [];
  notify();
  try {
    await AsyncStorage.removeItem(LIKED_SONGS_KEY);
  } catch (err) {
    console.warn('[LikedSongs] Failed to clear liked songs:', err);
  }
}

export function useLikedSongs(): LikedSong[] {
  useEffect(() => {
    if (!isLoaded) {
      void getLikedSongs();
    }
  }, []);

  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    () => cachedLikedSongs
  );
}

export function useIsSongLiked(songId?: string | null): boolean {
  const songs = useLikedSongs();
  if (!songId) return false;
  const id = songId.trim();
  return songs.some((s) => s.id === id);
}
