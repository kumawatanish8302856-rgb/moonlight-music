import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@moonlight/profile';

export type UserProfile = {
  name: string;
  dateOfBirth: string;
  phone: string;
};

export async function loadUserProfile(): Promise<UserProfile | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    return null;
  }

  if (
    !value ||
    typeof value !== 'object' ||
    !('name' in value) ||
    !('dateOfBirth' in value) ||
    !('phone' in value) ||
    typeof (value as any).name !== 'string' ||
    typeof (value as any).dateOfBirth !== 'string' ||
    typeof (value as any).phone !== 'string'
  ) {
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    return null;
  }

  return {
    name: (value as any).name,
    dateOfBirth: (value as any).dateOfBirth,
    phone: (value as any).phone,
  };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export async function clearUserProfile(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
