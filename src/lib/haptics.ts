import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Safe haptic feedback triggers with web and error guards.
 */

export function hapticLight(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

export function hapticMedium(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {}
}

export function hapticHeavy(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {}
}

export function hapticSuccess(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

export function hapticSelection(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.selectionAsync();
  } catch {}
}
