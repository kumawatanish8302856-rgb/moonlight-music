import AsyncStorage from '@react-native-async-storage/async-storage';
import bundledSongsData from '../constants/songs.json';
import cloudinaryCoversData from '../constants/cloudinary-covers.json';

export type Song = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl?: string;
  thumb?: string;
};

const bundledSongs: Song[] = (Array.isArray(bundledSongsData) ? bundledSongsData : []) as Song[];
const cloudinaryCoversMap = (cloudinaryCoversData || {}) as Record<string, string>;

export const DRIVE_FOLDER_ID: string = '1hu1kGOqDz2zM8H7aNd4SzMQl9ru3FB7n';
export const DRIVE_API_KEY: string = 'AIzaSyCRrMCDmjfP6XL8V_rGL5YNDQtts_00qKw';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  description?: string;
};

type DriveFileList = {
  files?: DriveFile[];
  nextPageToken?: string;
  error?: {
    message?: string;
  };
};

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const SONG_CACHE_TTL = 120_000;
const SONGS_STORAGE_KEY = '@moonlight/cached_songs';
const SEARCH_STOPWORDS = new Set(['song', 'songs', 'music', 'track', 'audio', 'mp3']);

export const TAG_SYNONYMS: Record<string, string[]> = {
  bollywood: ['bollywood', 'hindi', 'filmi'],
  punjabi: ['punjabi'],
  hiphop: ['hiphop', 'hip hop', 'rap'],
  love: ['love', 'romance', 'romantic', 'dil', 'ishq', 'pyaar', 'mohabbat'],
  romance: ['love', 'romance', 'romantic', 'dil', 'ishq', 'pyaar', 'mohabbat'],
  party: ['party', 'dance', 'club', 'remix', 'dhamaka', 'dj', 'bass'],
  workout: ['workout', 'gym', 'beat', 'bass', 'energy', 'power'],
  chill: ['chill', 'acoustic', 'slow', 'unplugged', 'peace', 'lofi', 'lo fi'],
  focus: ['focus', 'ambient', 'study', 'peace', 'chill', 'flow', 'deep'],
  devotional: ['devotional', 'bhajan', 'aarti', 'krishna', 'shiva', 'ram', 'hanuman', 'god', 'prarthana', 'bhakti'],
  sad: ['sad', 'dard', 'judaai', 'alone', 'broken', 'tears', 'bewafa'],
  pop: ['pop'],
  singermashup: ['singermashup', 'singer mashup', 'singer-mashup', 'singersmashup'],
  playlistmashup: ['playlistmashup', 'playlist mashup', 'playlist-mashup', 'playlistsmashup'],
};

let cachedSongs: Song[] | null = bundledSongs.length > 0 ? bundledSongs : null;
let cachedAt = bundledSongs.length > 0 ? Date.now() : 0;
let songsRequest: Promise<Song[]> | null = null;
let storageLoadPromise: Promise<Song[] | null> | null = null;

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim();
}

function normalizeName(name: string): string {
  return fileStem(name).toLocaleLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

function isAudioFile(file: DriveFile): boolean {
  return file.mimeType.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);
}

function isImageFile(file: DriveFile): boolean {
  return file.mimeType.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);
}

function parseSongName(name: string): { title: string; artist: string } {
  const stem = fileStem(name);
  const match = stem.match(/\s+[-–—]\s*/);
  if (!match || match.index === undefined) {
    return { title: stem, artist: 'Unknown' };
  }

  const title = stem.slice(0, match.index).trim();
  const artist = stem.slice(match.index + match[0].length).trim();
  return {
    title: title || stem,
    artist: artist || 'Unknown',
  };
}

function audioUrl(fileId: string): string {
  const params = new URLSearchParams({ alt: 'media', key: DRIVE_API_KEY });
  return `${DRIVE_API}/files/${fileId}?${params.toString()}`;
}

export function coverUrl(fileId: string, size: string | number = 'w800'): string {
  const cleanSize = typeof size === 'number' ? `w${size}` : (size.startsWith('w') || size.startsWith('s') ? size : `w${size}`);
  return `https://lh3.googleusercontent.com/d/${fileId}=${cleanSize}`;
}

export function thumbUrl(fileId: string, size: string | number = 'w300'): string {
  const cleanSize = typeof size === 'number' ? `w${size}` : (size.startsWith('w') || size.startsWith('s') ? size : `w${size}`);
  return `https://lh3.googleusercontent.com/d/${fileId}=${cleanSize}`;
}

export function formatCloudinaryUrl(url?: string, size: number = 800): string | undefined {
  if (!url) return undefined;
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  if (url.includes('/upload/w_') || url.includes('/upload/c_')) return url;
  return url.replace('/upload/', `/upload/w_${size},h_${size},c_fill,q_auto,f_auto/`);
}

export function toDirectCdnUrl(url?: string, defaultSize: string | number = 'w300'): string | undefined {
  if (!url) return undefined;
  if (url.includes('res.cloudinary.com')) {
    const numericSize = typeof defaultSize === 'number' ? defaultSize : parseInt(defaultSize.replace(/\D/g, ''), 10) || 300;
    return formatCloudinaryUrl(url, numericSize);
  }
  if (url.includes('lh3.googleusercontent.com/d/')) {
    return url.replace(/=sw(\d+)/, '=w$1');
  }
  const match = url.match(/[?&]id=([^&]+)/);
  if (match) {
    const sizeMatch = url.match(/[?&]sz=([^&]+)/);
    const size = sizeMatch ? sizeMatch[1] : (typeof defaultSize === 'number' ? `w${defaultSize}` : defaultSize);
    return `https://lh3.googleusercontent.com/d/${match[1]}=${size}`;
  }
  return url;
}

async function loadFromStorage(): Promise<Song[] | null> {
  if (storageLoadPromise) return storageLoadPromise;
  storageLoadPromise = (async () => {
    try {
      const data = await AsyncStorage.getItem(SONGS_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Normalize audioUrl and cover URLs so any previously cached URLs are migrated to the fast direct endpoint
          return (parsed as Song[]).map((song) => ({
            ...song,
            audioUrl: audioUrl(song.id),
            coverUrl: toDirectCdnUrl(song.coverUrl, 'w800'),
            thumb: toDirectCdnUrl(song.thumb, 'w300'),
          }));
        }
      }
    } catch {}
    return null;
  })();
  return storageLoadPromise;
}

async function saveToStorage(songs: Song[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
  } catch {}
}

async function listFolderFiles(): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,description,createdTime)',
      orderBy: 'createdTime desc',
      pageSize: '1000',
      key: DRIVE_API_KEY,
    });
    if (pageToken) params.set('pageToken', pageToken);

    // 10s request timeout so app never hangs
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    let result: DriveFileList;
    try {
      result = (await response.json()) as DriveFileList;
    } catch {
      throw new Error(`Google Drive returned an unreadable response (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(result.error?.message || `Google Drive request failed (${response.status}).`);
    }

    files.push(...(result.files ?? []));
    pageToken = result.nextPageToken;
  } while (pageToken);

  return files;
}

export async function fetchSongs(options: { force?: boolean } = {}): Promise<Song[]> {
  if (
    !DRIVE_FOLDER_ID ||
    DRIVE_FOLDER_ID === 'YOUR_GOOGLE_DRIVE_FOLDER_ID' ||
    !DRIVE_API_KEY ||
    DRIVE_API_KEY === 'YOUR_GOOGLE_DRIVE_API_KEY'
  ) {
    throw new Error('Set FOLDER_ID and API_KEY in src/lib/songs.ts to load your Google Drive songs.');
  }

  if (options.force) {
    cachedSongs = null;
    cachedAt = 0;
  }

  // Fast in-memory hit
  if (cachedSongs && Date.now() - cachedAt < SONG_CACHE_TTL) {
    return cachedSongs;
  }

  // Instant startup from disk cache if not forcing refresh
  if (!cachedSongs && !options.force) {
    const diskSongs = await loadFromStorage();
    if (diskSongs && diskSongs.length > 0) {
      cachedSongs = diskSongs;
      cachedAt = Date.now();
      // Silently refresh in background
      setTimeout(() => {
        void fetchSongs({ force: true }).catch(() => {});
      }, 500);
      return diskSongs;
    }
  }

  if (songsRequest) {
    return songsRequest;
  }

  songsRequest = (async () => {
    try {
      const files = await listFolderFiles();
      const imageFiles = files.filter(isImageFile);
      const idCovers = new Map(
        imageFiles
          .filter((file) => file.name.startsWith('moonlight-cover-'))
          .map((file) => [file.name.replace(/^moonlight-cover-/, '').replace(/\.[^.]+$/, ''), file] as const)
      );
      const covers = new Map(
        imageFiles.map((file) => [normalizeName(file.name), file] as const)
      );

      function resolveCover(audioFile: DriveFile, fallbackTitle: string): DriveFile | undefined {
        const byId = idCovers.get(audioFile.id);
        if (byId) return byId;

        const audioStem = normalizeName(audioFile.name);
        const byFullName = covers.get(audioStem);
        if (byFullName) return byFullName;

        const titleStem = normalizeName(fallbackTitle);
        const byTitle = covers.get(titleStem);
        if (byTitle) return byTitle;

        for (const [normImgName, imgFile] of covers.entries()) {
          if (normImgName.length >= 4 && (audioStem.startsWith(normImgName) || normImgName.startsWith(titleStem))) {
            return imgFile;
          }
        }
        return undefined;
      }

      const songs = files.filter(isAudioFile).map((file) => {
        const fallback = parseSongName(file.name);
        let fullCover: string | undefined;
        let thumbCover: string | undefined;

        // 1. High priority: Cloudinary or direct CDN URL stored in Google Drive description or local Cloudinary map
        const mappedCloudinary = cloudinaryCoversMap[file.id];
        if (file.description && file.description.trim().startsWith('http')) {
          const directUrl = file.description.trim();
          fullCover = formatCloudinaryUrl(directUrl, 800);
          thumbCover = formatCloudinaryUrl(directUrl, 300);
        } else if (mappedCloudinary) {
          fullCover = formatCloudinaryUrl(mappedCloudinary, 800);
          thumbCover = formatCloudinaryUrl(mappedCloudinary, 300);
        } else {
          // 2. Fallback: Google Drive paired cover image
          const cover = resolveCover(file, fallback.title);
          fullCover = cover ? coverUrl(cover.id, 'w800') : toDirectCdnUrl(file.thumbnailLink, 'w800');
          thumbCover = cover ? thumbUrl(cover.id, 'w300') : toDirectCdnUrl(file.thumbnailLink, 'w300');
        }

        return {
          id: file.id,
          title: fallback.title,
          artist: fallback.artist,
          audioUrl: audioUrl(file.id),
          ...(fullCover ? { coverUrl: fullCover } : {}),
          ...(thumbCover ? { thumb: thumbCover } : {}),
        };
      });

      cachedSongs = songs;
      cachedAt = Date.now();
      void saveToStorage(songs);
      return songs;
    } catch (err) {
      // If network fails but disk cache or bundled songs exist, gracefully fallback
      const diskSongs = await loadFromStorage();
      if (diskSongs && diskSongs.length > 0) {
        cachedSongs = diskSongs;
        cachedAt = Date.now();
        return diskSongs;
      }
      if (bundledSongs && bundledSongs.length > 0) {
        cachedSongs = bundledSongs;
        cachedAt = Date.now();
        return bundledSongs;
      }
      throw err;
    }
  })();

  try {
    return await songsRequest;
  } finally {
    songsRequest = null;
  }
}

export async function getAllSongs(force = false): Promise<Song[]> {
  return fetchSongs({ force });
}

function normalizeQuery(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function tokenScore(query: string, candidate: string): number {
  if (candidate === query) return 30;
  if (candidate.startsWith(query)) return 18;
  if (candidate.includes(query)) return 14;
  if (query.length < 4 || candidate.length < 4) return 0;

  const distance = editDistance(query, candidate);
  const allowedDistance = query.length >= 8 ? 2 : 1;
  return distance <= allowedDistance ? 10 - distance * 2 : 0;
}

export async function searchSongs(query: string, library?: readonly Song[]): Promise<Song[]> {
  const normalizedQuery = normalizeQuery(query);
  const rawWords = normalizedQuery.split(' ').filter(Boolean);
  if (!rawWords.length) return [];

  // Ignore generic stopwords if other search terms exist
  const significantWords = rawWords.filter((w) => !SEARCH_STOPWORDS.has(w));
  const queryWords = significantWords.length > 0 ? significantWords : rawWords;

  const songs = library ?? (await getAllSongs());
  const ranked = songs.flatMap((song) => {
    const title = normalizeQuery(song.title);
    const artist = normalizeQuery(song.artist);
    const titleWords = title.split(' ').filter(Boolean);
    const artistWords = artist.split(' ').filter(Boolean);
    const candidateWords = [...titleWords, ...artistWords];
    let score = 0;
    let matches = 0;

    if (title === normalizedQuery) score += 100;
    else if (title.startsWith(normalizedQuery)) score += 45;
    else if (title.includes(normalizedQuery)) score += 30;
    if (artist === normalizedQuery) score += 35;
    else if (artist.includes(normalizedQuery)) score += 20;

    for (const word of queryWords) {
      const best = candidateWords.reduce(
        (maximum, candidate) => Math.max(maximum, tokenScore(word, candidate)),
        0
      );
      if (best > 0) {
        score += best;
        matches++;
      }
    }

    return matches === queryWords.length && score > 0 ? [{ song, score }] : [];
  });

  return ranked
    .sort((left, right) => right.score - left.score || left.song.title.localeCompare(right.song.title))
    .map(({ song }) => song);
}

export async function songsByTag(tag: string, library?: readonly Song[]): Promise<Song[]> {
  const normalizedTag = normalizeQuery(tag);
  const songs = library ?? (await getAllSongs());
  const keywords = TAG_SYNONYMS[normalizedTag] ?? [normalizedTag];

  const matches = songs.filter((song) => {
    const searchable = normalizeQuery(`${song.title} ${song.artist}`);
    const words = searchable.split(' ').filter(Boolean);
    return keywords.some((kw) => {
      if (kw.includes(' ')) {
        return searchable.includes(kw);
      }
      return words.some((word) => word === kw || (kw.length >= 4 && word.startsWith(kw)));
    });
  });

  return matches;
}

export function songsErrorMessage(error?: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (!message) return 'Could not load songs from Google Drive.';
  if (message.includes('API key') || message.includes('keyInvalid')) {
    return 'Google Drive rejected the API key. Check its Drive API restriction and key settings.';
  }
  if (
    message.includes('File not found') ||
    message.includes('notFound') ||
    message.includes('404')
  ) {
    return 'Google Drive folder was not found or is not shared for public viewing.';
  }
  if (
    message.includes('PERMISSION_DENIED') ||
    message.includes('permission') ||
    message.includes('403')
  ) {
    return 'Google Drive denied access. Share the folder and its songs as Anyone with the link.';
  }
  if (message.includes('abort') || message.includes('timeout')) {
    return 'Connection timed out. Check your internet connection and try again.';
  }
  if (message.includes('fetch') || message.includes('Network')) {
    return 'Could not connect to Google Drive. Check your internet connection and try again.';
  }
  return message;
}
