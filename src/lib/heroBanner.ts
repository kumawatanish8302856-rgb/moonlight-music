import AsyncStorage from '@react-native-async-storage/async-storage';

const HERO_STORAGE_KEY = '@moonlight_hero_banner';
const DRIVE_FOLDER_ID = '1hu1kGOqDz2zM8H7aNd4SzMQl9ru3FB7n';
const DRIVE_API_KEY = 'AIzaSyCRrMCDmjfP6XL8V_rGL5YNDQtts_00qKw';
const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzcXCIU6nAe3v8IbPi3DxVwZIfKSEr7RwMD8f9NMWk11s58G6pDY3xh1Ig7of5vXBi6/exec';

export type HeroBannerConfig = {
  kicker?: string;
  title?: string;
  subtitle?: string;
  mode?: 'auto' | 'custom';
  songIds?: string[];
  covers?: string[];
  active?: boolean;
  updatedAt?: number;
};

export async function getCachedHeroConfig(): Promise<HeroBannerConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(HERO_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HeroBannerConfig) : null;
  } catch {
    return null;
  }
}

export async function fetchHeroConfig(): Promise<HeroBannerConfig | null> {
  // 1. Try Apps Script GET endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${SCRIPT_URL}?action=get_hero`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.hero && data.hero.active !== false) {
        await AsyncStorage.setItem(HERO_STORAGE_KEY, JSON.stringify(data.hero));
        return data.hero;
      }
    }
  } catch {}

  // 2. Fallback to Drive folder file moonlight-hero.json
  try {
    const query = encodeURIComponent(`'${DRIVE_FOLDER_ID}' in parents and name = 'moonlight-hero.json' and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&key=${DRIVE_API_KEY}`
    );
    if (res.ok) {
      const list = await res.json();
      const file = list.files?.[0];
      if (file?.id) {
        const fileRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${DRIVE_API_KEY}`
        );
        if (fileRes.ok) {
          const config = (await fileRes.json()) as HeroBannerConfig;
          if (config && config.active !== false) {
            await AsyncStorage.setItem(HERO_STORAGE_KEY, JSON.stringify(config));
            return config;
          }
        }
      }
    }
  } catch {}

  return null;
}
