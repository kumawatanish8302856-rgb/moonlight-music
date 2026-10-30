import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const VIBRATION_KEY = '@moonlight/vibration_enabled';
let isVibrationEnabled = true;

// Initialize setting from storage
AsyncStorage.getItem(VIBRATION_KEY)
  .then((val) => {
    if (val !== null) {
      isVibrationEnabled = val === 'true';
    }
  })
  .catch(() => {});

export async function getVibrationEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(VIBRATION_KEY);
    if (val !== null) {
      isVibrationEnabled = val === 'true';
      return isVibrationEnabled;
    }
  } catch {}
  return true;
}

export async function setVibrationEnabled(enabled: boolean): Promise<void> {
  isVibrationEnabled = enabled;
  try {
    await AsyncStorage.setItem(VIBRATION_KEY, enabled ? 'true' : 'false');
  } catch {}
}

/**
 * Safe haptic feedback triggers with web and vibration setting guards.
 */

export function hapticLight(): void {
  if (!isVibrationEnabled || Platform.OS === 'web') return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

export function hapticMedium(): void {
  if (!isVibrationEnabled || Platform.OS === 'web') return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {}
}

export function hapticHeavy(): void {
  if (!isVibrationEnabled || Platform.OS === 'web') return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {}
}

export function hapticSuccess(): void {
  if (!isVibrationEnabled || Platform.OS === 'web') return;
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

export function hapticSelection(): void {
  if (!isVibrationEnabled || Platform.OS === 'web') return;
  try {
    void Haptics.selectionAsync();
  } catch {}
}
