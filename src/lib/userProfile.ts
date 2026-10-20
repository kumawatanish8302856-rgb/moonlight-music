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
    throw new Error('Saved profile data could not be read.');
  }

  if (
    !value ||
    typeof value !== 'object' ||
    !('name' in value) ||
    !('dateOfBirth' in value) ||
    !('phone' in value) ||
    typeof value.name !== 'string' ||
    typeof value.dateOfBirth !== 'string' ||
    typeof value.phone !== 'string'
  ) {
    throw new Error('Saved profile data has an invalid format.');
  }

  return {
    name: value.name,
    dateOfBirth: value.dateOfBirth,
    phone: value.phone,
  };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export async function clearUserProfile(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
