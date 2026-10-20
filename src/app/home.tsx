import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { playerStore, useLibrary, usePlayback, usePlaying, type Song } from '../lib/playerStore';

// ---------- Moonlight theme ----------
const MOON = {
  bg: '#08060f',
  card: '#1a1430',
  cardBorder: 'rgba(167,139,250,0.15)',
  primary: '#8b5cf6',
  primarySoft: '#a78bfa',
  moon: '#fef3c7',
  text: '#f5f3ff',
  textDim: '#a89fc7',
  glow: 'rgba(139,92,246,0.35)',
};

type Grad = readonly [string, string];

const G: Record<string, Grad> = {
  primary: ['#8b5cf6', '#c026d3'],
  sunset: ['#f472b6', '#8b5cf6'],
  ocean: ['#22d3ee', '#6366f1'],
  fire: ['#fb923c', '#e11d48'],
  forest: ['#34d399', '#0ea5e9'],
  night: ['#312e81', '#7c3aed'],
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------- Data ----------
type Mood = {
  id: string;
  label: string;
  icon: IconName;
  grad: Grad;
  title: string;
  sub: string;
};

const MOODS: Mood[] = [
  { id: 'chill', label: 'Chill', icon: 'water', grad: G.ocean, title: 'Chill Nights', sub: 'Slow down and breathe easy' },
  { id: 'party', label: 'Party', icon: 'flame', grad: G.fire, title: 'Midnight Party', sub: 'Turn it up, lights down' },
  { id: 'focus', label: 'Focus', icon: 'bulb', grad: G.forest, title: 'Deep Focus', sub: 'Zero distractions, pure flow' },
  { id: 'sad', label: 'Sad', icon: 'rainy', grad: G.night, title: 'Rainy Hours', sub: 'For the quiet, heavy nights' },
  { id: 'romance', label: 'Romance', icon: 'heart', grad: G.sunset, title: 'Love Under Moon', sub: 'Songs for two' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 22 || h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// ---------- Small components ----------
const SongSection = memo(function SongSection({
  title,
  songs,
  onPlay,
}: {
  title: string;
  songs: Song[];
  onPlay: (index: number) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlatList
        data={songs}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(song) => song.id}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => onPlay(index)}
          >
            <Cover song={item} size={150} radius={24} />
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.cardSub} numberOfLines={2}>{item.artist}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
});

// ---------- Screen ----------
export default function HomeScreen() {
  const router = useRouter();
  const [moodId, setMoodId] = useState('chill');
  const { songs, loading, error } = useLibrary();
  const { current } = usePlayback();
  const playing = usePlaying();

  useEffect(() => {
    const state = playerStore.getState();
    if (state.loading) return;
    if (state.error) {
      void playerStore.loadSongs(true);
    } else if (!state.loaded) {
      void playerStore.loadSongs();
    }
  }, []);

  const mood = MOODS.find((m) => m.id === moodId) ?? MOODS[0];

  const playSong = useCallback((index: number) => {
    if (!songs[index]) return;
    playerStore.playQueue(songs, index);
    router.push('/player');
  }, [router, songs]);

  return (
    <LinearGradient
      colors={['#1b1040', MOON.bg, MOON.bg]}
      locations={[0, 0.4, 1]}
      style={styles.container}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor="#1b1040" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brand}>
              <Image
                source={require('@/assets/images/moonlight-logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.greeting}>{getGreeting()}</Text>
                <Text style={styles.brandName}>MOONLIGHT</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => void playerStore.loadSongs(true)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Refresh songs and dashboard updates"
            >
              {loading ? (
                <ActivityIndicator size="small" color={MOON.primarySoft} />
              ) : (
                <Ionicons name="refresh" size={19} color={MOON.primarySoft} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.tagline}>Music for the midnight mood</Text>

          {/* Mood selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.moodRow}
          >
            {MOODS.map((m) => {
              const active = m.id === moodId;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setMoodId(m.id)}
                  activeOpacity={0.85}
                  style={[styles.moodPill, !active && styles.moodPillOff]}
                >
                  {active && (
                    <LinearGradient
                      colors={m.grad}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Ionicons
                    name={m.icon}
                    size={16}
                    color={active ? '#fff' : MOON.primarySoft}
                  />
                  <Text style={[styles.moodText, active && { color: '#fff' }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Hero card */}
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={songs.length === 0 && !current}
            onPress={() => {
              if (current) {
                router.push('/player');
              } else {
                playSong(0);
              }
            }}
            style={styles.heroWrap}
          >
            <LinearGradient
              colors={mood.grad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Ionicons
                name="moon"
                size={150}
                color="rgba(255,255,255,0.14)"
                style={styles.heroMoon}
              />
              <Text style={styles.heroSmall}>
                {current ? 'NOW PLAYING' : 'YOUR SONGS'}
              </Text>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {current?.title ?? (songs.length ? mood.title : 'Your songs')}
              </Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {current?.artist ??
                  (loading ? 'Loading your Drive songs...' : error || `${songs.length} songs ready to play`)}
              </Text>
              <View style={styles.heroBtn}>
                {loading && !current ? (
                  <ActivityIndicator size="small" color="#1b1040" />
                ) : (
                  <Ionicons name={current && playing ? 'pause' : 'play'} size={16} color="#1b1040" />
                )}
                <Text style={styles.heroBtnText}>
                  {current ? 'Open player' : songs.length ? 'Play now' : 'No songs yet'}
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {songs.length > 0 && (
            <SongSection title="All songs" songs={songs} onPlay={playSong} />
          )}
          {!loading && !songs.length && (
            <View style={styles.emptyLibrary}>
              <Ionicons name={error ? 'cloud-offline-outline' : 'musical-notes-outline'} size={28} color={MOON.primarySoft} />
              <Text style={styles.emptyLibraryText}>
                {error || 'No songs found in your shared Drive folder.'}
              </Text>
              {!!error && (
                <TouchableOpacity onPress={() => void playerStore.loadSongs(true)}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>

        {current && (
          <View style={styles.miniWrap}>
            <LinearGradient
              colors={['#2a1659', '#3b1d7a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.miniPlayer}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.miniSong}
                onPress={() => router.push('/player')}
              >
                <Cover song={current} size={44} radius={14} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.miniTitle} numberOfLines={1}>{current.title}</Text>
                  <Text style={styles.miniArtist} numberOfLines={1}>{current.artist}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel={playing ? 'Pause song' : 'Play song'}
                style={styles.miniPlay}
                onPress={() => playerStore.toggle()}
              >
                <Ionicons
                  name={playing ? 'pause' : 'play'}
                  size={20}
                  color="#1b1040"
                  style={!playing ? { marginLeft: 2 } : undefined}
                />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        {/* Bottom nav */}
        <BottomNav active="home" />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: MOON.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  greeting: { color: MOON.textDim, fontSize: 12 },
  brandName: { color: MOON.text, fontSize: 17, fontWeight: 'bold', letterSpacing: 1 },
  headerIcons: { flexDirection: 'row' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  tagline: {
    color: MOON.primarySoft,
    fontSize: 13,
    paddingHorizontal: 20,
    marginTop: 18,
    letterSpacing: 0.5,
  },

  moodRow: { paddingHorizontal: 20, paddingVertical: 14 },
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    marginRight: 10,
    overflow: 'hidden',
  },
  moodPillOff: {
    backgroundColor: MOON.card,
    borderWidth: 1,
    borderColor: MOON.cardBorder,
  },
  moodText: { color: MOON.textDim, fontSize: 14, fontWeight: '600', marginLeft: 8 },

  heroWrap: { paddingHorizontal: 20, marginTop: 4 },
  hero: {
    borderRadius: 28,
    padding: 22,
    minHeight: 170,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  heroMoon: { position: 'absolute', right: -20, top: -20 },
  heroSmall: { color: 'rgba(255,255,255,0.8)', fontSize: 11, letterSpacing: 2 },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginTop: 6 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4 },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 16,
  },
  heroBtnText: { color: '#1b1040', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },

  section: { marginTop: 28 },
  sectionTitle: {
    color: MOON.text,
    fontSize: 20,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  card: { width: 150, marginRight: 16 },
  cardTitle: { color: MOON.text, fontSize: 14, fontWeight: 'bold', marginTop: 10 },
  cardSub: { color: MOON.textDim, fontSize: 12, marginTop: 2 },

  emptyLibrary: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 34,
    gap: 10,
  },
  emptyLibraryText: {
    color: MOON.textDim,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  retryText: { color: MOON.primarySoft, fontWeight: '700', padding: 8 },

  miniSong: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniWrap: { paddingHorizontal: 12, marginBottom: 8 },
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  miniTitle: { color: MOON.text, fontSize: 14, fontWeight: 'bold' },
  miniArtist: { color: '#c4b5fd', fontSize: 12, marginTop: 2 },
  miniPlay: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});