export type Song = {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl?: string;
  thumb?: string;
};

export const DRIVE_FOLDER_ID: string = '1hu1kGOqDz2zM8H7aNd4SzMQl9ru3FB7n';
export const DRIVE_API_KEY: string = 'AIzaSyCRrMCDmjfP6XL8V_rGL5YNDQtts_00qKw';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
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
const SONG_CACHE_TTL = 60_000;

let cachedSongs: Song[] | null = null;
let cachedAt = 0;
let songsRequest: Promise<Song[]> | null = null;

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
  const separator = stem.indexOf(' - ');
  if (separator < 0) return { title: stem, artist: 'Unknown' };

  return {
    title: stem.slice(0, separator).trim(),
    artist: stem.slice(separator + 3).trim() || 'Unknown',
  };
}

function audioUrl(fileId: string): string {
  const params = new URLSearchParams({ export: 'download', id: fileId });
  return `https://drive.google.com/uc?${params.toString()}`;
}

function coverUrl(fileId: string): string {
  const params = new URLSearchParams({ id: fileId, sz: 'w1000' });
  return `https://drive.google.com/thumbnail?${params.toString()}`;
}

async function listFolderFiles(): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink)',
      pageSize: '1000',
      key: DRIVE_API_KEY,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(`${DRIVE_API}/files?${params.toString()}`);
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
  if (cachedSongs && Date.now() - cachedAt < SONG_CACHE_TTL) {
    return cachedSongs;
  }
  if (songsRequest) {
    return songsRequest;
  }

  songsRequest = (async () => {
    const files = await listFolderFiles();
    const idCovers = new Map(
      files
        .filter((file) => isImageFile(file) && file.name.startsWith('moonlight-cover-'))
        .map((file) => [file.name.replace(/^moonlight-cover-/, '').replace(/\.[^.]+$/, ''), file] as const)
    );
    const covers = new Map(
      files.filter(isImageFile).map((file) => [normalizeName(file.name), file] as const)
    );

    const songs = files.filter(isAudioFile).map((file) => {
      const fallback = parseSongName(file.name);
      const cover = idCovers.get(file.id) ?? covers.get(normalizeName(file.name));
      const thumbnail = cover ? coverUrl(cover.id) : file.thumbnailLink;

      return {
        id: file.id,
        title: fallback.title,
        artist: fallback.artist,
        audioUrl: audioUrl(file.id),
        ...(thumbnail ? { coverUrl: thumbnail, thumb: thumbnail } : {}),
      };
    });

    cachedSongs = songs;
    cachedAt = Date.now();
    return songs;
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
  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  if (!queryWords.length) return [];

  const songs = library ?? (await getAllSongs());
  const ranked = songs.flatMap((song) => {
    const title = normalizeQuery(song.title);
    const artist = normalizeQuery(song.artist);
    const titleWords = title.split(' ');
    const artistWords = artist.split(' ');
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
  const matches = songs.filter((song) => {
    const searchable = normalizeQuery(`${song.title} ${song.artist}`);
    return searchable.includes(normalizedTag);
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
  if (message.includes('fetch') || message.includes('Network')) {
    return 'Could not connect to Google Drive. Check your internet connection and try again.';
  }
  return message;
}
