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

function formatCloudinaryUrl(url, size = 800) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  if (url.includes('/upload/w_') || url.includes('/upload/c_')) return url;
  return url.replace('/upload/', `/upload/w_${size},h_${size},c_fill,q_auto,f_auto/`);
}

function audioUrl(fileId) {
  const params = new URLSearchParams({ alt: 'media', key: DRIVE_API_KEY });
  return `${DRIVE_API}/files/${fileId}?${params.toString()}`;
}

function coverUrl(fileId, size = 800) {
  return `https://lh3.googleusercontent.com/d/${fileId}=s${size}`;
}

async function listFolderFiles() {
  const files = [];
  let pageToken;

  do {
    const params = new URLSearchParams({
      q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,description,createdTime)',
      orderBy: 'createdTime desc',
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

  const imageFiles = files.filter(isImageFile);
  const idCovers = new Map(
    imageFiles
      .filter((file) => file.name.startsWith('moonlight-cover-'))
      .map((file) => [file.name.replace(/^moonlight-cover-/, '').replace(/\.[^.]+$/, ''), file])
  );
  const covers = new Map(
    imageFiles.map((file) => [normalizeName(file.name), file])
  );

  function resolveCover(audioFile, fallbackTitle) {
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

  const mapPath = path.resolve(__dirname, '../src/constants/cloudinary-covers.json');
  let cloudinaryCoversMap = {};
  if (fs.existsSync(mapPath)) {
    try {
      cloudinaryCoversMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    } catch {}
  }

  const songs = files.filter(isAudioFile).map((file) => {
    const fallback = parseSongName(file.name);
    let fullCover;
    let thumbCover;

    const mappedCloudinary = (file.description && file.description.trim().startsWith('http'))
      ? file.description.trim()
      : cloudinaryCoversMap[file.id];

    if (mappedCloudinary) {
      fullCover = formatCloudinaryUrl(mappedCloudinary, 800);
      thumbCover = formatCloudinaryUrl(mappedCloudinary, 400);
    } else {
      const cover = resolveCover(file, fallback.title);
      fullCover = cover ? coverUrl(cover.id, 800) : file.thumbnailLink;
      thumbCover = cover ? coverUrl(cover.id, 400) : file.thumbnailLink;
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

  const targetPath = path.resolve(__dirname, '../src/constants/songs.json');
  fs.writeFileSync(targetPath, JSON.stringify(songs, null, 2), 'utf8');

  console.log(`✨ Successfully synced ${songs.length} songs to:`);
  console.log(`   ${targetPath}`);
}

main().catch((err) => {
  console.error('❌ Error syncing songs:', err);
  process.exit(1);
});
