import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRIVE_FOLDER_ID = '1hu1kGOqDz2zM8H7aNd4SzMQl9ru3FB7n';
const DRIVE_API_KEY = 'AIzaSyCRrMCDmjfP6XL8V_rGL5YNDQtts_00qKw';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

function fileStem(name) {
  return name.replace(/\.[^.]+$/, '').trim();
}

function normalizeName(name) {
  return fileStem(name).toLocaleLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

function isAudioFile(file) {
  return file.mimeType.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.name);
}

function isImageFile(file) {
  return file.mimeType.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);
}

function parseSongName(name) {
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

function audioUrl(fileId) {
  const params = new URLSearchParams({ alt: 'media', key: DRIVE_API_KEY });
  return `${DRIVE_API}/files/${fileId}?${params.toString()}`;
}

function coverUrl(fileId, size = 'w800') {
  const params = new URLSearchParams({ id: fileId, sz: size });
  return `https://drive.google.com/thumbnail?${params.toString()}`;
}

async function listFolderFiles() {
  const files = [];
  let pageToken;

  do {
    const params = new URLSearchParams({
      q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink)',
      pageSize: '1000',
      key: DRIVE_API_KEY,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${DRIVE_API}/files?${params.toString()}`);
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Google Drive API failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

async function main() {
  console.log('📡 Fetching files from Google Drive...');
  const files = await listFolderFiles();
  console.log(`📁 Found ${files.length} total files in folder.`);

  const idCovers = new Map(
    files
      .filter((file) => isImageFile(file) && file.name.startsWith('moonlight-cover-'))
      .map((file) => [file.name.replace(/^moonlight-cover-/, '').replace(/\.[^.]+$/, ''), file])
  );
  const covers = new Map(
    files.filter(isImageFile).map((file) => [normalizeName(file.name), file])
  );

  const songs = files.filter(isAudioFile).map((file) => {
    const fallback = parseSongName(file.name);
    const cover = idCovers.get(file.id) ?? covers.get(normalizeName(file.name));
    const fullCover = cover ? coverUrl(cover.id, 'w800') : file.thumbnailLink;
    const thumbCover = cover ? coverUrl(cover.id, 'w300') : file.thumbnailLink;

    return {
      id: file.id,
      title: fallback.title,
      artist: fallback.artist,
      audioUrl: audioUrl(file.id),
      ...(fullCover ? { coverUrl: fullCover } : {}),
      ...(thumbCover ? { thumb: thumbCover } : {}),
    };
  });

  const targetPath = path.resolve(__dirname, '../src/constants/songs.json');
  fs.writeFileSync(targetPath, JSON.stringify(songs, null, 2), 'utf8');

  console.log(`✨ Successfully synced ${songs.length} songs to:`);
  console.log(`   ${targetPath}`);
}

main().catch((err) => {
  console.error('❌ Error syncing songs:', err);
  process.exit(1);
});
