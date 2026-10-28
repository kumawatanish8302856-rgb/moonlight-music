import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Cover, { gradientFor } from '../components/Cover';
import { GRADIENTS, MOON } from '../constants/moonlight';
import { player, playerStore, toggleLikeSong, useIsSongLiked, usePlayback, usePlaying } from '../lib/playerStore';

const BARS = Array.from({ length: 44 }, (_, i) =>
  10 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 28
);
const ART = Math.min(Dimensions.get('window').width - 72, 320);

function fmt(s: number) {
  const t = Math.max(0, Number.isFinite(s) ? s : 0);
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

// ---------- Progress bar ----------
function Progress() {
  if (!player) return null;
  return <LoadedProgress audioPlayer={player} />;
}

function LoadedProgress({ audioPlayer }: { audioPlayer: AudioPlayer }) {
  const status = useAudioPlayerStatus(audioPlayer);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [barWidth, setBarWidth] = useState(1);
  const [panHandlers, setPanHandlers] =
    useState<ReturnType<typeof PanResponder.create>['panHandlers'] | null>(null);

  const durationRef = useRef(0);
  const barWidthRef = useRef(1);
  const startXRef = useRef(0);

  const duration = status.duration || 0;
  const playbackProgress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const progress = scrubRatio ?? playbackProgress;
  const displayedTime = scrubRatio === null ? status.currentTime : scrubRatio * duration;

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    barWidthRef.current = barWidth;
  }, [barWidth]);

  useEffect(() => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => durationRef.current > 0,
      onMoveShouldSetPanResponder: () => durationRef.current > 0,
      onPanResponderGrant: (event) => {
        startXRef.current = event.nativeEvent.locationX;
        if (durationRef.current > 0 && barWidthRef.current > 0) {
          setScrubRatio(
            Math.min(1, Math.max(0, startXRef.current / barWidthRef.current))
          );
        }
      },
      onPanResponderMove: (_event, gestureState) => {
        if (durationRef.current <= 0 || barWidthRef.current <= 0) return;
        const ratio = (startXRef.current + gestureState.dx) / barWidthRef.current;
        setScrubRatio(Math.min(1, Math.max(0, ratio)));
      },
      onPanResponderRelease: (_event, gestureState) => {
        const currentDuration = durationRef.current;
        const currentWidth = barWidthRef.current;
        if (currentDuration > 0 && currentWidth > 0) {
          const ratio = Math.min(
            1,
            Math.max(0, (startXRef.current + gestureState.dx) / currentWidth)
          );
          playerStore.seek(ratio * currentDuration);
        }
        setScrubRatio(null);
      },
      onPanResponderTerminate: () => setScrubRatio(null),
      onPanResponderTerminationRequest: () => false,
    });
    setPanHandlers(responder.panHandlers);
  }, []);

  const thumbLeft = Math.max(0, Math.min(barWidth - 10, progress * (barWidth - 10)));

  return (
    <View style={styles.progressWrap}>
      <View
        style={styles.wave}
        onLayout={(e) => {
          const width = Math.max(1, e.nativeEvent.layout.width);
          setBarWidth(width);
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Song progress"
        accessibilityValue={{ min: 0, max: duration, now: displayedTime }}
        {...(panHandlers ?? {})}
      >
        <View pointerEvents="none" style={styles.waveBars}>
          {BARS.map((h, i) => (
            <View
              key={i}
              style={{
                width: 3,
                height: h,
                borderRadius: 2,
                backgroundColor:
                  i / BARS.length < progress ? MOON.primarySoft : 'rgba(255,255,255,0.18)',
              }}
            />
          ))}
          <View style={[styles.scrubThumb, { left: thumbLeft }]} />
        </View>
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.time}>{fmt(displayedTime)}</Text>
        {!status.isLoaded && <Text style={styles.time}>Loading...</Text>}
        <Text style={styles.time}>{fmt(duration)}</Text>
      </View>
    </View>
  );
}

function LoadingLogo({ audioPlayer }: { audioPlayer: AudioPlayer }) {
  const status = useAudioPlayerStatus(audioPlayer);
  const [rotation] = useState(() => new Animated.Value(0));
  const isLoading = !status.isLoaded || status.isBuffering;

  useEffect(() => {
    if (!isLoading) {
      rotation.stopAnimation();
      rotation.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [rotation, isLoading]);

  if (!isLoading) return null;

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View pointerEvents="none" style={styles.loadingOverlay}>
      <View style={styles.loadingLogoWrap}>
        <Animated.Image
          source={require('@/assets/images/moonlight-logo.png')}
          resizeMode="contain"
          style={[styles.loadingLogo, { transform: [{ rotate }] }]}
        />
      </View>
    </View>
  );
}

// ---------- Screen ----------
export default function PlayerScreen() {
  const router = useRouter();
  const { current, queue, index, shuffle, repeat } = usePlayback();
  const playing = usePlaying();
  const isLiked = useIsSongLiked(current?.id);
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.spring(scale, {
      toValue: playing ? 1 : 0.9,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [playing, scale]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  }, [router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  // ---------- No song selected ----------
  if (!current) {
    return (
      <LinearGradient colors={['#2a1659', '#120d22', MOON.bg]} style={styles.container}>
        <SafeAreaView style={{ flex: 1, paddingHorizontal: 24 }} edges={['top', 'bottom']}>
          <StatusBar style="light" />
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={goBack}>
              <Ionicons name="chevron-down" size={26} color={MOON.text} />
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.emptyWrap}>
            <Ionicons name="moon-outline" size={56} color={MOON.primarySoft} />
            <Text style={styles.emptyTitle}>No song selected</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.replace('/home')}
              style={{ marginTop: 22 }}
            >
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>Go to Home</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      {/* Artwork subtle background gradient */}
      <LinearGradient
        colors={gradientFor(current.id)}
        style={[StyleSheet.absoluteFill, { opacity: 0.75 }]}
      />
      <LinearGradient
        colors={['rgba(8,6,15,0.5)', 'rgba(8,6,15,0.85)', MOON.bg]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={{ flex: 1, paddingHorizontal: 24 }} edges={['top', 'bottom']}>
        <StatusBar style="light" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={goBack}>
            <Ionicons name="chevron-down" size={26} color={MOON.text} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerSmall}>NOW PLAYING</Text>
            <Text style={styles.headerBig}>
              {index + 1} of {queue.length}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Artwork */}
        <View style={styles.artArea}>
          <Animated.View style={[styles.artShadow, { transform: [{ scale }] }]}>
            <Cover song={current} size={ART} radius={28} />
          </Animated.View>
          {player && <LoadingLogo audioPlayer={player} />}
        </View>

        {/* Title & Favorite */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.songTitle} numberOfLines={2}>
              {current.title}
            </Text>
            <Text style={styles.songArtist} numberOfLines={1}>
              {current.artist}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => void toggleLikeSong(current)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isLiked ? 'Unlike song' : 'Like song'}
          >
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={28}
              color={isLiked ? '#f43f5e' : MOON.textDim}
            />
          </TouchableOpacity>
        </View>

        <Progress />

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={() => playerStore.toggleShuffle()}>
            <Ionicons name="shuffle" size={24} color={shuffle ? MOON.accent : MOON.textDim} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => playerStore.prev()}>
            <Ionicons name="play-skip-back" size={32} color={MOON.text} />
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.85} onPress={() => playerStore.toggle()}>
            <LinearGradient colors={GRADIENTS.primary} style={styles.playBtn}>
              <Ionicons
                name={playing ? 'pause' : 'play'}
                size={34}
                color="#fff"
                style={!playing ? { marginLeft: 4 } : undefined}
              />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => playerStore.next()}>
            <Ionicons name="play-skip-forward" size={32} color={MOON.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => playerStore.toggleRepeat()}>
            <Ionicons name="repeat" size={24} color={repeat ? MOON.accent : MOON.textDim} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 28 }} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MOON.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSmall: { color: MOON.primarySoft, fontSize: 10, letterSpacing: 2 },
  headerBig: { color: MOON.text, fontSize: 14, fontWeight: 'bold', marginTop: 2 },

  artArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogoWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(8,6,15,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: { width: 72, height: 72 },
  artShadow: {
    borderRadius: 28,
    backgroundColor: MOON.card,
    elevation: 18,
    shadowColor: MOON.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
  },

  titleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  songTitle: { color: MOON.text, fontSize: 24, fontWeight: 'bold' },
  songArtist: { color: MOON.textDim, fontSize: 15, marginTop: 4 },

  progressWrap: { marginTop: 22 },
  wave: {
    height: 44,
    justifyContent: 'center',
  },
  waveBars: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 44,
  },
  scrubThumb: {
    position: 'absolute',
    top: 17,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MOON.primarySoft,
    borderWidth: 2,
    borderColor: '#fff',
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  time: { color: MOON.textDim, fontSize: 12 },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: MOON.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
  },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: MOON.text, fontSize: 20, fontWeight: 'bold', marginTop: 18 },
  emptyBtn: {
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
