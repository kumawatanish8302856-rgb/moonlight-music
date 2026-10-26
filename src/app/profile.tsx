import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNav from '../components/BottomNav';
import Cover from '../components/Cover';
import {
  clearRecentlyPlayed,
  playerStore,
  recordToSong,
  toggleLikeSong,
  useLibrary,
  useLikedSongs,
  useRecentlyPlayed,
} from '../lib/playerStore';
import { clearUserProfile, loadUserProfile, type UserProfile } from '../lib/userProfile';

const BG = '#08060f';

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const [activeTab, setActiveTab] = useState<'recent' | 'liked'>('recent');
  const recentRecords = useRecentlyPlayed();
  const likedSongs = useLikedSongs();
  const { songs } = useLibrary();

  const playHistorySong = (index: number) => {
    const list = recentRecords.map((r) => recordToSong(r, songs));
    if (!list[index]) return;
    playerStore.playQueue(list, index);
    router.push('/player');
  };

  const playLikedSong = (index: number) => {
    if (!likedSongs[index]) return;
    playerStore.playQueue(likedSongs, index);
    router.push('/player');
  };

  const playAllLiked = () => {
    if (likedSongs.length === 0) return;
    playerStore.playQueue(likedSongs, 0);
    router.push('/player');
  };

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
      router.replace('/welcome');
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
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerArea}>
              <Image
                source={require('@/assets/images/moonlight-logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
              <Text style={styles.brand}>MOONLIGHT</Text>
              <Text style={styles.title}>My Profile</Text>
            </View>

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
                  hitSlop={8}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </>
            )}

            {profile && (
              <View style={styles.details}>
                <ProfileDetail icon="person-outline" label="Name" value={profile.name} />
                <ProfileDetail
                  icon="calendar-outline"
                  label="Date of birth"
                  value={profile.dateOfBirth || 'Not specified'}
                />
                <ProfileDetail
                  icon="call-outline"
                  label="Phone number"
                  value={profile.phone || 'Not specified'}
                />
              </View>
            )}

            {/* Tab Selector: Recently Played vs Liked Songs */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'recent' && styles.tabButtonActive]}
                activeOpacity={0.8}
                onPress={() => setActiveTab('recent')}
              >
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={activeTab === 'recent' ? '#fff' : '#a89fc7'}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'recent' && styles.tabButtonTextActive,
                  ]}
                >
                  Recently Played ({recentRecords.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'liked' && styles.tabButtonActiveLiked]}
                activeOpacity={0.8}
                onPress={() => setActiveTab('liked')}
              >
                <Ionicons
                  name={activeTab === 'liked' ? 'heart' : 'heart-outline'}
                  size={16}
                  color={activeTab === 'liked' ? '#fff' : '#f43f5e'}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'liked' && styles.tabButtonTextActive,
                  ]}
                >
                  Liked Songs ({likedSongs.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab Content: Recently Played */}
            {activeTab === 'recent' ? (
              <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="time-outline" size={18} color="#a78bfa" />
                    <Text style={styles.historyTitle}>
                      Recently Played Songs ({recentRecords.length}/20)
                    </Text>
                  </View>
                  {recentRecords.length > 0 && (
                    <TouchableOpacity
                      onPress={() => void clearRecentlyPlayed()}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Clear listening history"
                    >
                      <Text style={styles.clearBtnText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {recentRecords.length === 0 ? (
                  <View style={styles.emptyHistory}>
                    <Ionicons name="time-outline" size={32} color="#a89fc7" style={{ opacity: 0.5, marginBottom: 8 }} />
                    <Text style={styles.emptyHistoryText}>No recently played songs yet.</Text>
                    <Text style={styles.emptyHistorySub}>Songs you listen to will automatically appear here.</Text>
                  </View>
                ) : (
                  recentRecords.map((rec, i) => (
                    <TouchableOpacity
                      key={rec.songId}
                      style={styles.historyRow}
                      activeOpacity={0.8}
                      onPress={() => playHistorySong(i)}
                    >
                      <Cover song={recordToSong(rec, songs)} size={42} radius={6} />
                      <View style={styles.historyTextWrap}>
                        <Text style={styles.historySongTitle} numberOfLines={1}>
                          {rec.title}
                        </Text>
                        <Text style={styles.historySongSub} numberOfLines={1}>
                          {rec.artist || 'Unknown'} • {formatTimeAgo(rec.playedAt)}
                        </Text>
                      </View>
                      <Ionicons name="play-circle-outline" size={24} color="#a78bfa" />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : (
              /* Tab Content: Liked Songs */
              <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="heart" size={18} color="#f43f5e" />
                    <Text style={styles.historyTitle}>
                      Liked Songs ({likedSongs.length})
                    </Text>
                  </View>
                  {likedSongs.length > 0 && (
                    <TouchableOpacity
                      onPress={playAllLiked}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Play all liked songs"
                    >
                      <Text style={styles.playAllBtnText}>Play all</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {likedSongs.length === 0 ? (
                  <View style={styles.emptyHistory}>
                    <Ionicons name="heart-outline" size={32} color="#fda4af" style={{ opacity: 0.6, marginBottom: 8 }} />
                    <Text style={styles.emptyHistoryText}>No liked songs yet.</Text>
                    <Text style={styles.emptyHistorySub}>Tap the heart icon in the player to save your favorite songs here.</Text>
                  </View>
                ) : (
                  likedSongs.map((song, i) => (
                    <TouchableOpacity
                      key={song.id}
                      style={styles.historyRow}
                      activeOpacity={0.8}
                      onPress={() => playLikedSong(i)}
                    >
                      <Cover song={song} size={42} radius={6} />
                      <View style={styles.historyTextWrap}>
                        <Text style={styles.historySongTitle} numberOfLines={1}>
                          {song.title}
                        </Text>
                        <Text style={styles.historySongSub} numberOfLines={1}>
                          {song.artist || 'Unknown'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => void toggleLikeSong(song)}
                        hitSlop={10}
                        style={{ padding: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel="Unlike song"
                      >
                        <Ionicons name="heart" size={22} color="#f43f5e" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.logout, loggingOut && styles.disabled]}
              onPress={() => void logout()}
              disabled={loggingOut || !profile}
              activeOpacity={0.85}
              hitSlop={8}
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
          </ScrollView>
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
    alignItems: 'center',
  },
  headerArea: {
    alignItems: 'center',
    width: '100%',
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 36,
    alignItems: 'center',
    flex: 1,
  },
  logo: { width: 80, height: 80, marginBottom: 10 },
  brand: { color: '#a78bfa', fontSize: 13, letterSpacing: 3, fontWeight: '700' },
  title: { color: '#f5f3ff', fontSize: 26, fontWeight: '800', marginTop: 8, marginBottom: 28 },
  error: { color: '#fda4af', marginBottom: 12, textAlign: 'center', fontSize: 13 },
  retry: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    marginBottom: 20,
  },
  retryText: { color: '#a78bfa', fontWeight: '600', fontSize: 13 },
  details: { width: '100%', gap: 14 },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1430',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  detailText: { marginLeft: 14, flex: 1 },
  label: { color: '#a89fc7', fontSize: 12 },
  value: { color: '#f5f3ff', fontSize: 15, fontWeight: '600', marginTop: 2 },
  logout: {
    marginTop: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(244,63,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.3)',
    width: '100%',
  },
  disabled: { opacity: 0.6 },
  logoutText: { color: '#fda4af', fontWeight: '700', fontSize: 15, marginLeft: 8 },

  tabBar: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 22,
    backgroundColor: 'rgba(26,20,48,0.7)',
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.18)',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#8b5cf6',
  },
  tabButtonActiveLiked: {
    backgroundColor: '#ec4899',
  },
  tabButtonText: {
    color: '#a89fc7',
    fontSize: 12,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  playAllBtnText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyHistorySub: {
    color: '#6b6488',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },

  historyCard: {
    width: '100%',
    marginTop: 16,
    backgroundColor: '#1a1430',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 18,
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  historyTitle: {
    color: '#f5f3ff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  clearBtnText: {
    color: '#fda4af',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyHistory: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyHistoryText: {
    color: '#a89fc7',
    fontSize: 13,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(167,139,250,0.12)',
  },
  historyTextWrap: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  historySongTitle: {
    color: '#f5f3ff',
    fontSize: 14,
    fontWeight: '600',
  },
  historySongSub: {
    color: '#a89fc7',
    fontSize: 12,
    marginTop: 2,
  },
});
