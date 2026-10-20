import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNav from '../components/BottomNav';
import { clearUserProfile, loadUserProfile, type UserProfile } from '../lib/userProfile';

const BG = '#08060f';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    loadUserProfile()
      .then((savedProfile) => {
        if (active) setProfile(savedProfile);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load your profile.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  const logout = async () => {
    setLoggingOut(true);
    setError('');
    try {
      await clearUserProfile();
      router.replace('/');
    } catch (logoutError: unknown) {
      setError(logoutError instanceof Error ? logoutError.message : 'Could not log out.');
      setLoggingOut(false);
    }
  };

  if (!loading && !error && !profile) return <Redirect href="/welcome" />;

  return (
    <LinearGradient colors={['#1b1040', BG, BG]} locations={[0, 0.4, 1]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor="#1b1040" />
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#a78bfa" />
          </View>
        ) : (
          <View style={styles.content}>
            <Image
              source={require('@/assets/images/moonlight-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.brand}>MOONLIGHT</Text>
            <Text style={styles.title}>My Profile</Text>

            {!!error && (
              <>
                <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
                <TouchableOpacity
                  style={styles.retry}
                  onPress={() => {
                    setLoading(true);
                    setError('');
                    setRetry((value) => value + 1);
                  }}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </>
            )}

            {profile && (
              <View style={styles.details}>
                <ProfileDetail icon="person-outline" label="Name" value={profile.name} />
                <ProfileDetail icon="calendar-outline" label="Date of birth" value={profile.dateOfBirth} />
                <ProfileDetail icon="call-outline" label="Phone number" value={profile.phone} />
              </View>
            )}

            <TouchableOpacity
              style={[styles.logout, loggingOut && styles.disabled]}
              onPress={() => void logout()}
              disabled={loggingOut || !profile}
              activeOpacity={0.85}
            >
              {loggingOut ? (
                <ActivityIndicator color="#fda4af" />
              ) : (
                <>
                  <Ionicons name="log-out-outline" size={20} color="#fda4af" />
                  <Text style={styles.logoutText}>Log out</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        <BottomNav active="profile" />
      </SafeAreaView>
    </LinearGradient>
  );
}

function ProfileDetail({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detail}>
      <Ionicons name={icon} size={21} color="#a78bfa" />
      <View style={styles.detailText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  logo: { width: 78, height: 78 },
  brand: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 3, marginTop: 8 },
  title: { color: '#f5f3ff', fontSize: 27, fontWeight: '800', marginTop: 24 },
  details: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#171128',
    borderColor: 'rgba(167,139,250,0.25)',
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    marginTop: 28,
  },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 17 },
  detailText: { flex: 1 },
  label: { color: '#a89fc7', fontSize: 12 },
  value: { color: '#f5f3ff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  error: { color: '#fda4af', marginTop: 16, textAlign: 'center' },
  retry: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#c4b5fd', fontWeight: '700' },
  logout: {
    minWidth: 160,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(253,164,175,0.35)',
    borderRadius: 24,
    marginTop: 26,
    paddingHorizontal: 22,
  },
  disabled: { opacity: 0.65 },
  logoutText: { color: '#fda4af', fontSize: 15, fontWeight: '700' },
});
