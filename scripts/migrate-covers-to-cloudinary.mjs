import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLOUD_NAME = 'b6nva3ai';
const UPLOAD_PRESET = 'moonlight_covers';

const songsPath = path.resolve(__dirname, '../src/constants/songs.json');
const mapPath = path.resolve(__dirname, '../src/constants/cloudinary-covers.json');

function formatCloudinaryUrl(url, size = 800) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
  if (url.includes('/upload/w_') || url.includes('/upload/c_')) return url;
  return url.replace('/upload/', `/upload/w_${size},h_${size},c_fill,q_auto,f_auto/`);
}

async function uploadToCloudinary(remoteUrl, publicId) {
  const payload = {
    file: remoteUrl,
    upload_preset: UPLOAD_PRESET,
  };
  if (publicId) {
    payload.public_id = publicId;
  }

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (data.secure_url) {
    return data.secure_url;
  }
  throw new Error(data.error?.message || 'Upload failed');
}

async function main() {
  console.log('🚀 Starting thumbnail migration to Cloudinary...');
  const songs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));

  let existingMap = {};
  if (fs.existsSync(mapPath)) {
    try {
      existingMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    } catch {}
  }

  let migrated = 0;
  let alreadyDone = 0;
  let failed = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const indexStr = `[${i + 1}/${songs.length}]`;

    // Check if already on Cloudinary
    if (existingMap[song.id]) {
      const cUrl = existingMap[song.id];
      song.coverUrl = formatCloudinaryUrl(cUrl, 800);
      song.thumb = formatCloudinaryUrl(cUrl, 400);
      alreadyDone++;
      continue;
    }

    if (song.coverUrl && song.coverUrl.includes('res.cloudinary.com')) {
      existingMap[song.id] = song.coverUrl;
      alreadyDone++;
      continue;
    }

    if (!song.coverUrl || (!song.coverUrl.includes('googleusercontent.com') && !song.coverUrl.includes('drive.google.com'))) {
      console.log(`${indexStr} ⏩ Skipping "${song.title}" (No Drive cover URL)`);
      continue;
    }

    try {
      console.log(`${indexStr} ⏳ Uploading cover for "${song.title}"...`);
      const publicId = `moonlight_${song.id}`;
      const cdnUrl = await uploadToCloudinary(song.coverUrl, publicId);

      existingMap[song.id] = cdnUrl;
      song.coverUrl = formatCloudinaryUrl(cdnUrl, 800);
      song.thumb = formatCloudinaryUrl(cdnUrl, 400);
      migrated++;
      console.log(`   ✅ Success: ${cdnUrl}`);

      // Save progress incrementally
      fs.writeFileSync(mapPath, JSON.stringify(existingMap, null, 2), 'utf8');
      fs.writeFileSync(songsPath, JSON.stringify(songs, null, 2), 'utf8');

      // Small pause to be gentle with rate limits
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      failed++;
      console.error(`   ❌ Failed for "${song.title}":`, err.message);
    }
  }

  fs.writeFileSync(mapPath, JSON.stringify(existingMap, null, 2), 'utf8');
  fs.writeFileSync(songsPath, JSON.stringify(songs, null, 2), 'utf8');

  console.log('\n=======================================');
  console.log(`🎉 Migration Completed!`);
  console.log(`   ✅ Newly Migrated: ${migrated}`);
  console.log(`   ⚡ Already on Cloudinary: ${alreadyDone}`);
  console.log(`   ⚠️ Failed: ${failed}`);
  console.log(`   📁 Output saved to:`);
  console.log(`      - ${songsPath}`);
  console.log(`      - ${mapPath}`);
  console.log('=======================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
