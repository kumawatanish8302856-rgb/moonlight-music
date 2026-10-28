import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { DRIVE_API_KEY, DRIVE_FOLDER_ID } from './songs';
import { loadUserProfile } from './userProfile';

export type MoonlightNotification = {
  id: string;
  title: string;
  tagline: string;
  imageUrl?: string;
  songId?: string;
  active: boolean;
  createdAt: number;
};

const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzcXCIU6nAe3v8IbPi3DxVwZIfKSEr7RwMD8f9NMWk11s58G6pDY3xh1Ig7of5vXBi6/exec';
const LAST_SEEN_KEY = '@moonlight/last_seen_notification_id';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

export async function fetchActiveNotification(): Promise<MoonlightNotification | null> {
  // 1. Try Google Apps Script direct GET endpoint (fastest)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(SCRIPT_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && data.notification && data.notification.active !== false) {
        return data.notification as MoonlightNotification;
      }
    }
  } catch {}

  // 2. Fallback: Check Google Drive folder for moonlight-notification.json
  try {
    const query = encodeURIComponent(
      `'${DRIVE_FOLDER_ID}' in parents and name = 'moonlight-notification.json' and trashed = false`
    );
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&key=${DRIVE_API_KEY}`
    );
    if (res.ok) {
      const json = await res.json();
      const fileId = json.files?.[0]?.id;
      if (fileId) {
        const fileRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${DRIVE_API_KEY}`
        );
        if (fileRes.ok) {
          const notif = await fileRes.json();
          if (notif && notif.active !== false) {
            return notif as MoonlightNotification;
          }
        }
      }
    }
  } catch {}

  return null;
}

export async function getLastSeenNotificationId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export async function markNotificationAsSeen(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SEEN_KEY, id);
  } catch {}
}

export async function getPersonalizedNotification(
  notification: MoonlightNotification
): Promise<{ title: string; tagline: string; imageUrl?: string; songId?: string }> {
  let userName = 'Music Lover';
  try {
    const profile = await loadUserProfile();
    if (profile?.name && profile.name.trim()) {
      userName = profile.name.trim();
    }
  } catch {}

  const rawTitle = notification.title || 'Hey {name}! \uD83C\uDF19';
  const rawTagline = notification.tagline || '';

  const title = rawTitle.replace(/\{name\}|\{user\}/gi, userName);
  const tagline = rawTagline.replace(/\{name\}|\{user\}/gi, userName);

  return {
    title,
    tagline,
    imageUrl: notification.imageUrl,
    songId: notification.songId,
  };
}

export async function triggerSystemNotification(
  notification: MoonlightNotification
): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  const { title, tagline, songId } = await getPersonalizedNotification(notification);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: tagline,
        data: { songId, notificationId: notification.id },
        sound: true,
      },
      trigger: null,
    });
  } catch {}
}
