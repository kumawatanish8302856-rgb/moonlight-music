import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNav from '../components/BottomNav';
import Cover from '../components/Cover';
import {
  getVibrationEnabled,
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
  setVibrationEnabled,
} from '../lib/haptics';
import {
  getNotificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
} from '../lib/notifications';
import {
  clearRecentlyPlayed,
  playerStore,
  recordToSong,
  toggleLikeSong,
  useLibrary,
  useLikedSongs,
  useRecentlyPlayed,
} from '../lib/playerStore';
import {
  clearUserProfile,
  loadUserProfile,
  saveUserProfile,
  type UserProfile,
} from '../lib/userProfile';

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

function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'M';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  // Settings state
  const [vibrationOn, setVibrationOn] = useState(true);
  const [notificationsOn, setNotificationsOn] = useState(true);

  // Edit profile modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Active view: 'recent' or 'liked'
  const [activeTab, setActiveTab] = useState<'recent' | 'liked'>('recent');
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [showAllLiked, setShowAllLiked] = useState(false);
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

    // Load Profile
    loadUserProfile()
      .then((savedProfile) => {
        if (active) {
          setProfile(savedProfile);
          if (savedProfile) {
            setEditName(savedProfile.name || '');
            setEditDob(savedProfile.dateOfBirth || '');
            setEditPhone(savedProfile.phone || '');
          }
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load your profile.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Load Settings
    void (async () => {
      const vib = await getVibrationEnabled();
      const notif = await getNotificationsEnabled();
      if (active) {
        setVibrationOn(vib);
        setNotificationsOn(notif);
      }
    })();

    return () => {
      active = false;
    };
  }, [retry]);

  const handleToggleVibration = async (value: boolean) => {
    setVibrationOn(value);
    await setVibrationEnabled(value);
    if (value) {
      hapticMedium();
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    hapticLight();
    setNotificationsOn(value);
    await setNotificationsEnabled(value);
    if (value) {
      void requestNotificationPermission();
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }

    try {
      setSavingProfile(true);
      const updated: UserProfile = {
        name: editName.trim(),
        dateOfBirth: editDob.trim(),
        phone: editPhone.trim(),
      };
      await saveUserProfile(updated);
      setProfile(updated);
      hapticSuccess();
      setEditModalVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

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
    <LinearGradient colors={['#1c1042', BG, BG]} locations={[0, 0.35, 1]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#a78bfa" size="large" />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Brand Header */}
            <View style={styles.headerArea}>
              <Image
                source={require('@/assets/images/moonlight-logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
              <Text style={styles.brand}>MOONLIGHT</Text>
              <Text style={styles.title}>My Account</Text>
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

            {/* 1. Clickable My Profile Card (Tap to Edit) */}
            {profile && (
              <TouchableOpacity
                style={styles.profileCard}
                activeOpacity={0.85}
                onPress={() => {
                  hapticSelection();
                  setEditName(profile.name || '');
                  setEditDob(profile.dateOfBirth || '');
                  setEditPhone(profile.phone || '');
                  setEditModalVisible(true);
                }}
              >
                <LinearGradient
                  colors={['rgba(139, 92, 246, 0.22)', 'rgba(26, 20, 48, 0.85)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />

                <View style={styles.avatarWrap}>
                  <LinearGradient
                    colors={['#8b5cf6', '#d946ef']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatar}
                  >
                    <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
                  </LinearGradient>
                </View>

                <View style={styles.profileInfo}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {profile.name || 'User Profile'}
                  </Text>
                  <Text style={styles.profileSub} numberOfLines={1}>
                    {profile.phone ? `${profile.phone}` : 'Tap to edit details'}
                    {profile.dateOfBirth ? ` • ${profile.dateOfBirth}` : ''}
                  </Text>
                </View>

                <View style={styles.editPill}>
                  <Ionicons name="pencil" size={13} color="#c084fc" style={{ marginRight: 4 }} />
                  <Text style={styles.editPillText}>Edit</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* 2. Settings Section (Vibration & Notifications Toggles) */}
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="settings-sharp" size={15} color="#c084fc" />
                <Text style={styles.sectionTitle}>SETTINGS</Text>
              </View>

              <View style={styles.settingsCard}>
                {/* Vibration Row */}
                <View style={styles.settingRow}>
                  <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(168, 85, 247, 0.16)' }]}>
                    <Ionicons name="pulse" size={18} color="#c084fc" />
                  </View>
                  <View style={styles.settingTextWrap}>
                    <Text style={styles.settingTitle}>Vibration Touch</Text>
                    <Text style={styles.settingSub}>Tactile feedback on music controls & taps</Text>
                  </View>
                  <Switch
                    value={vibrationOn}
                    onValueChange={handleToggleVibration}
                    trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#8b5cf6' }}
                    thumbColor={vibrationOn ? '#ffffff' : '#cbd5e1'}
                  />
                </View>

                <View style={styles.settingDivider} />

                {/* Notifications Row */}
                <View style={styles.settingRow}>
                  <View style={[styles.settingIconWrap, { backgroundColor: 'rgba(251, 191, 36, 0.16)' }]}>
                    <Ionicons name="notifications" size={18} color="#fde047" />
                  </View>
                  <View style={styles.settingTextWrap}>
                    <Text style={styles.settingTitle}>Push Notifications</Text>
                    <Text style={styles.settingSub}>New drops & release broadcasts</Text>
                  </View>
                  <Switch
                    value={notificationsOn}
                    onValueChange={handleToggleNotifications}
                    trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#8b5cf6' }}
                    thumbColor={notificationsOn ? '#ffffff' : '#cbd5e1'}
                  />
                </View>
              </View>
            </View>

            {/* 3. Two Side-by-Side Square Cards: Recently Played & Liked Songs */}
            <View style={styles.squareCardsRow}>
              {/* Square Card 1: Recently Played */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.squareCard,
                  activeTab === 'recent' && styles.squareCardActiveRecent,
                ]}
                onPress={() => {
                  hapticSelection();
                  setActiveTab('recent');
                }}
              >
                <LinearGradient
                  colors={
                    activeTab === 'recent'
                      ? ['rgba(139, 92, 246, 0.28)', 'rgba(26, 20, 48, 0.95)']
                      : ['rgba(255, 255, 255, 0.05)', 'rgba(26, 20, 48, 0.6)']
                  }
                  style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
                />
                <View style={styles.squareCardTop}>
                  <View style={[styles.squareIconWrap, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
                    <Ionicons name="time" size={20} color="#c084fc" />
                  </View>
                  <Text style={styles.squareCardCount}>{recentRecords.length}</Text>
                </View>
                <Text style={styles.squareCardTitle}>Recently Played</Text>
                <Text style={styles.squareCardSub}>Listening history</Text>
                {activeTab === 'recent' && <View style={styles.activeDotRecent} />}
              </TouchableOpacity>

              {/* Square Card 2: Liked Songs */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.squareCard,
                  activeTab === 'liked' && styles.squareCardActiveLiked,
                ]}
                onPress={() => {
                  hapticSelection();
                  setActiveTab('liked');
                }}
              >
                <LinearGradient
                  colors={
                    activeTab === 'liked'
                      ? ['rgba(244, 63, 94, 0.28)', 'rgba(26, 20, 48, 0.95)']
                      : ['rgba(255, 255, 255, 0.05)', 'rgba(26, 20, 48, 0.6)']
                  }
                  style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
                />
                <View style={styles.squareCardTop}>
                  <View style={[styles.squareIconWrap, { backgroundColor: 'rgba(244, 63, 94, 0.2)' }]}>
                    <Ionicons name="heart" size={20} color="#f43f5e" />
                  </View>
                  <Text style={styles.squareCardCount}>{likedSongs.length}</Text>
                </View>
                <Text style={styles.squareCardTitle}>Liked Songs</Text>
                <Text style={styles.squareCardSub}>Favorite tracks</Text>
                {activeTab === 'liked' && <View style={styles.activeDotLiked} />}
              </TouchableOpacity>
            </View>

            {/* 4. Interactive Songs List Container (Based on selected Square Card) */}
            {activeTab === 'recent' ? (
              <View style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="time" size={18} color="#c084fc" />
                    <Text style={styles.historyTitle}>
                      Recently Played Songs ({recentRecords.length}/20)
                    </Text>
                  </View>
                  {recentRecords.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        hapticLight();
                        void clearRecentlyPlayed();
                      }}
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
                  <>
                    {(showAllRecent ? recentRecords : recentRecords.slice(0, 5)).map((rec) => {
                      const origIndex = recentRecords.findIndex((r) => r.songId === rec.songId);
                      return (
                        <TouchableOpacity
                          key={rec.songId}
                          style={styles.historyRow}
                          activeOpacity={0.8}
                          onPress={() => playHistorySong(origIndex >= 0 ? origIndex : 0)}
                        >
                          <Cover song={recordToSong(rec, songs)} size={42} radius={8} />
                          <View style={styles.historyTextWrap}>
                            <Text style={styles.historySongTitle} numberOfLines={1}>
                              {rec.title}
                            </Text>
                            <Text style={styles.historySongSub} numberOfLines={1}>
                              {rec.artist || 'Unknown'} • {formatTimeAgo(rec.playedAt)}
                            </Text>
                          </View>
                          <Ionicons name="play-circle" size={26} color="#a78bfa" />
                        </TouchableOpacity>
                      );
                    })}

                    {recentRecords.length > 5 && (
                      <TouchableOpacity
                        style={styles.seeAllBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                          hapticSelection();
                          setShowAllRecent((prev) => !prev);
                        }}
                      >
                        <Text style={styles.seeAllBtnText}>
                          {showAllRecent ? 'Show less' : `See all (${recentRecords.length})`}
                        </Text>
                        <Ionicons
                          name={showAllRecent ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="#c084fc"
                        />
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            ) : (
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
                  <>
                    {(showAllLiked ? likedSongs : likedSongs.slice(0, 5)).map((song) => {
                      const origIndex = likedSongs.findIndex((s) => s.id === song.id);
                      return (
                        <TouchableOpacity
                          key={song.id}
                          style={styles.historyRow}
                          activeOpacity={0.8}
                          onPress={() => playLikedSong(origIndex >= 0 ? origIndex : 0)}
                        >
                          <Cover song={song} size={42} radius={8} />
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
                      );
                    })}

                    {likedSongs.length > 5 && (
                      <TouchableOpacity
                        style={styles.seeAllLikedBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                          hapticSelection();
                          setShowAllLiked((prev) => !prev);
                        }}
                      >
                        <Text style={styles.seeAllLikedBtnText}>
                          {showAllLiked ? 'Show less' : `See all (${likedSongs.length})`}
                        </Text>
                        <Ionicons
                          name={showAllLiked ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="#fda4af"
                        />
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Logout Button */}
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

        {/* Edit Profile Modal */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setEditModalVisible(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="person-circle" size={22} color="#c084fc" />
                  <Text style={styles.modalTitle}>Edit Profile</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setEditModalVisible(false)}
                  style={styles.modalCloseBtn}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color="#a89fc7" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalForm}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Enter your name"
                  placeholderTextColor="#6b6488"
                  style={styles.textInput}
                />

                <Text style={styles.inputLabel}>Date of Birth</Text>
                <TextInput
                  value={editDob}
                  onChangeText={setEditDob}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor="#6b6488"
                  style={styles.textInput}
                />

                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="Enter phone number"
                  placeholderTextColor="#6b6488"
                  keyboardType="phone-pad"
                  style={styles.textInput}
                />

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.saveBtn}
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                >
                  <LinearGradient
                    colors={['#8b5cf6', '#d946ef']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.saveBtnGradient}
                  >
                    {savingProfile ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save Profile</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <BottomNav active="profile" />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  headerArea: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  logo: { width: 56, height: 56, marginBottom: 8 },
  brand: { color: '#a78bfa', fontSize: 12, letterSpacing: 3, fontWeight: '700' },
  title: { color: '#f5f3ff', fontSize: 24, fontWeight: '800', marginTop: 4 },
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

  // 1. Profile Card
  profileCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171033',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarWrap: {
    marginRight: 14,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  profileName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 3,
  },
  profileSub: {
    color: '#a89fc7',
    fontSize: 12,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginLeft: 8,
  },
  editPillText: {
    color: '#c084fc',
    fontSize: 12,
    fontWeight: '700',
  },

  // 2. Settings Section
  sectionWrap: {
    width: '100%',
    marginTop: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#a89fc7',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  settingsCard: {
    backgroundColor: '#160f2e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  settingTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingSub: {
    color: '#8e84b0',
    fontSize: 11,
  },
  settingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    marginLeft: 48,
  },

  // 3. Two Square Cards
  squareCardsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: 20,
  },
  squareCard: {
    flex: 1,
    height: 124,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
    padding: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#160f2e',
  },
  squareCardActiveRecent: {
    borderColor: '#8b5cf6',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  squareCardActiveLiked: {
    borderColor: '#f43f5e',
    shadowColor: '#f43f5e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  squareCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  squareIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareCardCount: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  squareCardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  squareCardSub: {
    color: '#8e84b0',
    fontSize: 11,
    fontWeight: '500',
  },
  activeDotRecent: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8b5cf6',
  },
  activeDotLiked: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f43f5e',
  },

  // 4. History / Liked List
  historyCard: {
    width: '100%',
    marginTop: 18,
    backgroundColor: '#160f2e',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 20,
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
  playAllBtnText: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyHistory: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyHistoryText: {
    color: '#a89fc7',
    fontSize: 13,
  },
  emptyHistorySub: {
    color: '#6b6488',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
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
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
    gap: 6,
  },
  seeAllBtnText: {
    color: '#c084fc',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  seeAllLikedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.25)',
    gap: 6,
  },
  seeAllLikedBtnText: {
    color: '#fda4af',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  logout: {
    marginTop: 26,
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

  // Edit Profile Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 4, 15, 0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#160f2e',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    padding: 22,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalForm: {
    gap: 14,
  },
  inputLabel: {
    color: '#a89fc7',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: -6,
    marginLeft: 4,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 15,
  },
  saveBtn: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  saveBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
