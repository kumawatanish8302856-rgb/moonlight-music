import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Cover, { gradientFor } from '../components/Cover';
import { GRADIENTS, MOON } from '../constants/moonlight';
import { player, playerStore, usePlayback, usePlaying } from '../lib/playerStore';

const BARS = Array.from({ length: 44 }, (_, i) =>
  10 + Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 28
);
const ART = Math.min(Dimensions.get('window').width - 72, 320);

function fmt(s: number) {
  const t = Math.max(0, s || 0);
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

// ---------- Progress (alag component, sirf yahi baar-baar update hota hai) ----------
function Progress() {
  if (!player) return null;
  return <LoadedProgress audioPlayer={player} />;
}

function LoadedProgress({ audioPlayer }: { audioPlayer: AudioPlayer }) {
  const status = useAudioPlayerStatus(audioPlayer);
  const [barWidth, setBarWidth] = useState(1);

  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  return (
    <View style={styles.progressWrap}>
      <Pressable
        style={styles.wave}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (!duration) return;
          const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth));
          playerStore.seek(ratio * duration);
        }}
      >
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
      </Pressable>
      <View style={styles.timeRow}>
        <Text style={styles.time}>{fmt(status.currentTime)}</Text>
        {!status.isLoaded && <Text style={styles.time}>Loading...</Text>}
        <Text style={styles.time}>{fmt(duration)}</Text>
      </View>
    </View>
  );
}

// ---------- Screen ----------
export default function PlayerScreen() {
  const router = useRouter();
  const { current, queue, index, shuffle, repeat } = usePlayback();
  const playing = usePlaying();
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.spring(scale, {
      toValue: playing ? 1 : 0.9,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [playing, scale]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/home');
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  const goBack = () => router.replace('/home');

  // ---------- Koi song nahi chuna ----------
  if (!current) {
    return (
      <LinearGradient colors={['#2a1659', '#120d22', MOON.bg]} style={styles.container}>
        <SafeAreaView style={{ flex: 1, paddingHorizontal: 24 }} edges={['top', 'bottom']}>
          <StatusBar barStyle="light-content" backgroundColor="#2a1659" />
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={goBack}>
              <Ionicons name="chevron-down" size={26} color={MOON.text} />
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.emptyWrap}>
            <Ionicons name="moon-outline" size={56} color={MOON.primarySoft} />
            <Text style={styles.emptyTitle}>Koi song nahi chuna</Text>
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
                <Text style={styles.emptyBtnText}>Home par jao</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      {/* Keep the artwork background lightweight; the full cover is shown below. */}
      <LinearGradient
        colors={gradientFor(current.id)}
        style={[StyleSheet.absoluteFill, { opacity: 0.75 }]}
      />
      <LinearGradient
        colors={['rgba(8,6,15,0.5)', 'rgba(8,6,15,0.85)', MOON.bg]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={{ flex: 1, paddingHorizontal: 24 }} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor="#08060f" />

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
        </View>

        {/* Title */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.songTitle} numberOfLines={2}>
              {current.title}
            </Text>
            <Text style={styles.songArtist} numberOfLines={1}>
              {current.artist}
            </Text>
          </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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