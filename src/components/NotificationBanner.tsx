import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOON } from '../constants/moonlight';
import {
  fetchActiveNotification,
  getLastSeenNotificationId,
  getPersonalizedNotification,
  markNotificationAsSeen,
  triggerSystemNotification,
  type MoonlightNotification,
} from '../lib/notifications';
import { playerStore, useLibrary } from '../lib/playerStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const NotificationBanner = memo(function NotificationBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { songs } = useLibrary();

  const [notification, setNotification] = useState<MoonlightNotification | null>(null);
  const [personalized, setPersonalized] = useState<{
    title: string;
    tagline: string;
    imageUrl?: string;
    songId?: string;
  } | null>(null);

  const translateY = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isShowing = useRef(false);

  const hideBanner = useCallback(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -200,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isShowing.current = false;
      setNotification(null);
      setPersonalized(null);
    });
  }, [translateY, opacity]);

  const showBanner = useCallback(
    (notif: MoonlightNotification, custom: { title: string; tagline: string; imageUrl?: string; songId?: string }) => {
      setNotification(notif);
      setPersonalized(custom);
      isShowing.current = true;

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: insets.top > 0 ? insets.top + 8 : 16,
          useNativeDriver: true,
          bounciness: 6,
          speed: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss after 8 seconds
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        hideBanner();
      }, 8000);
    },
    [insets.top, translateY, opacity, hideBanner]
  );

  const checkNotification = useCallback(async () => {
    try {
      const active = await fetchActiveNotification();
      if (!active || !active.active) return;

      const lastSeenId = await getLastSeenNotificationId();
      if (lastSeenId === active.id) return;

      // Personalized title and tagline
      const custom = await getPersonalizedNotification(active);

      // Trigger native notification
      void triggerSystemNotification(active);

      // Show in-app banner
      showBanner(active, custom);

      // Mark as seen so user is not spammed
      await markNotificationAsSeen(active.id);
    } catch {}
  }, [showBanner]);

  useEffect(() => {
    // Initial check after app loads
    const timer = setTimeout(() => {
      void checkNotification();
    }, 1500);

    return () => clearTimeout(timer);
  }, [checkNotification]);

  const handlePress = useCallback(() => {
    if (!personalized) return;
    const songId = personalized.songId;

    hideBanner();

    if (songId) {
      const targetIndex = songs.findIndex((s) => s.id === songId);
      if (targetIndex >= 0) {
        playerStore.playQueue(songs, targetIndex);
        router.push('/player');
        return;
      }
    }
  }, [personalized, songs, hideBanner, router]);

  if (!notification || !personalized) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        style={styles.card}
      >
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <Image
              source={require('@/assets/images/moonlight-logo.png')}
              style={styles.brandLogo}
              contentFit="contain"
            />
            <Text style={styles.brandText}>MOONLIGHT</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.timeText}>Just now</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={hideBanner}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color={MOON.textDim} />
          </TouchableOpacity>
        </View>

        <View style={styles.contentRow}>
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {personalized.title}
            </Text>
            <Text style={styles.tagline} numberOfLines={2}>
              {personalized.tagline}
            </Text>
          </View>

          {Boolean(personalized.imageUrl) && (
            <Image
              source={{ uri: personalized.imageUrl }}
              style={styles.thumbnail}
              contentFit="cover"
              transition={100}
            />
          )}
        </View>

        {Boolean(personalized.songId) && (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={12} color="#1b1040" style={{ marginRight: 4 }} />
            <Text style={styles.playText}>Tap to Listen Now</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});

export default NotificationBanner;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    zIndex: 9999,
    alignItems: 'center',
  },
  card: {
    width: Math.min(SCREEN_WIDTH - 28, 480),
    backgroundColor: 'rgba(26, 20, 48, 0.94)',
    borderColor: 'rgba(167, 139, 250, 0.35)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLogo: {
    width: 16,
    height: 16,
    marginRight: 6,
  },
  brandText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fef3c7',
    letterSpacing: 0.8,
  },
  dot: {
    fontSize: 10,
    color: MOON.textDim,
    marginHorizontal: 4,
  },
  timeText: {
    fontSize: 10,
    color: MOON.textDim,
  },
  closeBtn: {
    padding: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  tagline: {
    fontSize: 12,
    color: '#d8b4fe',
    lineHeight: 16,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
  },
  playBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#a78bfa',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 8,
  },
  playText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1b1040',
  },
});
