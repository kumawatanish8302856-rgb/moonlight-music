import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { Song } from './songs';

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}moonlight_songs/`;

let isDirReady = false;

async function ensureCacheDir(): Promise<void> {
  if (isDirReady || Platform.OS === 'web' || !FileSystem.cacheDirectory) return;
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
    isDirReady = true;
  } catch {
    // Ignore directory creation errors
  }
}

// Track active background downloads to avoid duplicating downloads
const activeDownloads = new Map<string, Promise<string | null>>();

function getSafeFilename(songId: string): string {
  return `${songId.replace(/[^a-zA-Z0-9_-]/g, '_')}.m4a`;
}

/**
 * Returns a local file:// URI if cached, otherwise returns the stream audioUrl
 * and triggers background caching so that the next playback is instant.
 */
export async function getPlayableAudioUri(song: Song): Promise<string> {
  if (Platform.OS === 'web' || !FileSystem.cacheDirectory) {
    return song.audioUrl;
  }

  await ensureCacheDir();

  const filename = getSafeFilename(song.id);
  const localUri = `${CACHE_DIR}${filename}`;

  try {
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    // If file exists and is > 100KB, it's a valid complete cached song!
    if (fileInfo.exists && (fileInfo.size ?? 0) > 100 * 1024) {
      return localUri;
    }
  } catch {
    // Fall back to stream URL
  }

  // Not yet cached: trigger background download without blocking playback
  triggerBackgroundCache(song, localUri);

  return song.audioUrl;
}

/**
 * Downloads the song in the background into local device storage.
 */
function triggerBackgroundCache(song: Song, localUri: string): void {
  if (Platform.OS === 'web' || !FileSystem.cacheDirectory) return;
  if (activeDownloads.has(song.id)) return;

  const downloadPromise = (async () => {
    try {
      const res = await FileSystem.downloadAsync(song.audioUrl, localUri);
      if (res.status === 200) {
        return localUri;
      }
    } catch {
      // Quietly ignore download failure (network blip, etc.)
    } finally {
      activeDownloads.delete(song.id);
    }
    return null;
  })();

  activeDownloads.set(song.id, downloadPromise);
}
