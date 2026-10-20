import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect } from 'expo-router';
import { loadUserProfile, type UserProfile } from '../lib/userProfile';

export default function IndexScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
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

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#a78bfa" />
        <Text style={styles.message}>Loading your profile...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text accessibilityRole="alert" style={styles.message}>{error}</Text>
        <TouchableOpacity
          style={styles.retry}
          onPress={() => {
            setLoading(true);
            setRetry((value) => value + 1);
          }}
        >
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <Redirect href={profile ? '/home' : '/welcome'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#08060f',
    padding: 24,
  },
  message: { color: '#f5f3ff', textAlign: 'center', marginTop: 12 },
  retry: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 22, backgroundColor: '#a78bfa' },
  retryText: { color: '#08060f', fontWeight: '700' },
});
