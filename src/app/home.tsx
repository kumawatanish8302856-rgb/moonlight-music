import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNav from '../components/BottomNav';
import Cover from '../components/Cover';
import {
  fetchHeroConfig,
  getCachedHeroConfig,
  type HeroBannerConfig,
} from '../lib/heroBanner';
import {
  fetchActiveNotification,
  getLastSeenNotificationId,
  getPersonalizedNotification,
  markNotificationAsSeen,
  requestInitialPermissions,
} from '../lib/notifications';
import { playerStore, useLibrary, usePlayback, usePlaying, type Song } from '../lib/playerStore';
import { toDirectCdnUrl } from '../lib/songs';
import { useYouTubeHistory } from '../lib/youtubeHistory';

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

const SONG_SHUFFLE_SEED = Date.now();

// ---------- Layout constants ----------
const SIDE_PAD = 16;
const GAP = 12;

const renderGap = () => <View style={{ width: GAP }} />;

function shuffleSongs(songs: readonly Song[]): Song[] {
  const shuffled = [...songs];
  let seed = SONG_SHUFFLE_SEED;

  for (let index = shuffled.length - 1; index > 0; index--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const randomIndex = Math.floor((seed / 0x100000000) * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 22 || h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function pick(songs: Song[], offset: number, count: number): Song[] {
  if (!songs.length) return [];
  const n = Math.min(count, songs.length);
  return Array.from({ length: n }, (_, i) => songs[(offset + i) % songs.length]);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function filterSongsByKeywords(
  allSongs: Song[],
  keywords: string[],
  fallbackPool: Song[],
  count = 9
): Song[] {
  const matches = allSongs.filter((song) => {
    const text = `${song.title} ${song.artist}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  });

  const unique = new Set(matches.map((s) => s.id));
  const result = [...matches];

  for (const song of fallbackPool) {
    if (result.length >= count) break;
    if (!unique.has(song.id)) {
      unique.add(song.id);
      result.push(song);
    }
  }

  return result.slice(0, count);
}

function formatCount(song: Song, unit: 'plays' | 'views'): string {
  const real = (song as any)?.plays ?? (song as any)?.views;
  let n = typeof real === 'number' ? real : 0;
  if (!n) {
    let h = 0;
    const id = song?.id ?? '';
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    n = 10_000 + (h % 9_000_000);
  }
  const text =
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : `${n}`;
  return `${text} ${unit}`;
}

// ---------- Shared: section header ----------
const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
  onPlayAll,
}: {
  title: string;
  subtitle?: string;
  onPlayAll: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, marginRight: 12 }}>
        {!!subtitle && <Text style={styles.sectionKicker}>{subtitle}</Text>}
        <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
      </View>
      <TouchableOpacity
        style={styles.playAllBtn}
        activeOpacity={0.8}
        onPress={onPlayAll}
        accessibilityRole="button"
        accessibilityLabel={`Play all ${title}`}
      >
        <Ionicons name="play" size={11} color={MOON.primarySoft} />
        <Text style={styles.playAllText}>Play all</Text>
      </TouchableOpacity>
    </View>
  );
});

// ---------- Arrangement 1: multi-row paginated grid ----------
const GridSection = memo(function GridSection({
  title,
  subtitle,
  songs,
  rows,
  columnsCount,
  unit,
  onPlay,
  onPlayAll,
}: {
  title: string;
  subtitle?: string;
  songs: Song[];
  rows: number;
  columnsCount?: number;
  unit: 'plays' | 'views';
  onPlay: (songs: Song[], index: number) => void;
  onPlayAll: (songs: Song[]) => void;
}) {
  const { width } = useWindowDimensions();
  const targetCols = columnsCount ?? (width >= 900 ? 3 : width >= 600 ? 2 : 1);
  const effectiveCols = width < 600 ? 1 : targetCols;
  const colWidth =
    effectiveCols > 1
      ? Math.floor((width - SIDE_PAD * 2 - (effectiveCols - 1) * GAP) / effectiveCols)
      : Math.round(width * 0.88);
  const columns = useMemo(() => chunk(songs, rows), [songs, rows]);

  if (!songs.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} subtitle={subtitle} onPlayAll={() => onPlayAll(songs)} />
      <FlatList
        data={columns}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={colWidth + GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        nestedScrollEnabled
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD }}
        keyExtractor={(col, index) => col[0]?.id ?? String(index)}
        ItemSeparatorComponent={renderGap}
        renderItem={({ item: col, index: colIndex }) => (
          <View style={{ width: colWidth }}>
            {col.map((song, i) => (
              <TouchableOpacity
                key={song.id}
                style={styles.row}
                activeOpacity={0.8}
                onPress={() => onPlay(songs, colIndex * rows + i)}
              >
                <Cover song={song} size={52} radius={6} />
                <View style={styles.rowMid}>
                  <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">
                    {song.title}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1} ellipsizeMode="tail">
                    {song.artist} • {formatCount(song, unit)}
                  </Text>
                </View>
                <View style={styles.rowMenu}>
                  <Ionicons name="ellipsis-vertical" size={18} color={MOON.textDim} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />
    </View>
  );
});

// ---------- Arrangement 2: 16:9 video carousel ----------
const VideoSection = memo(function VideoSection({
  title,
  subtitle,
  songs,
  onPlay,
  onPlayAll,
}: {
  title: string;
  subtitle?: string;
  songs: Song[];
  onPlay: (songs: Song[], index: number) => void;
  onPlayAll: (songs: Song[]) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.round(width * 0.78);
  const thumbH = Math.round((cardWidth * 9) / 16);

  if (!songs.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} subtitle={subtitle} onPlayAll={() => onPlayAll(songs)} />
      <FlatList
        data={songs}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        nestedScrollEnabled
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD }}
        keyExtractor={(song) => song.id}
        ItemSeparatorComponent={renderGap}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={{ width: cardWidth }}
            activeOpacity={0.9}
            onPress={() => onPlay(songs, index)}
          >
            <View style={[styles.videoThumb, { height: thumbH }]}>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -(cardWidth - thumbH) / 2,
                  left: 0,
                  opacity: 0.45,
                }}
              >
                <Cover song={item} size={cardWidth} radius={0} />
              </View>
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <LinearGradient
                  colors={['rgba(8,6,15,0.55)', 'rgba(8,6,15,0.85)']}
                  style={StyleSheet.absoluteFill}
                />
              </View>
              <View style={styles.videoArt}>
                <Cover song={item} size={thumbH} radius={8} />
              </View>
              <View style={styles.videoPlayBadge}>
                <Ionicons name="play" size={16} color="#1b1040" style={{ marginLeft: 2 }} />
              </View>
            </View>
            <Text style={styles.videoTitle} numberOfLines={1} ellipsizeMode="tail">
              {item.title}
            </Text>
            <Text style={styles.videoSub} numberOfLines={1} ellipsizeMode="tail">
              {item.artist} • {formatCount(item, 'views')}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
});

// ---------- Arrangement 3: square album / playlist carousel ----------
const SquareSection = memo(function SquareSection({
  title,
  subtitle,
  songs,
  onPlay,
  onPlayAll,
}: {
  title: string;
  subtitle?: string;
  songs: Song[];
  onPlay: (songs: Song[], index: number) => void;
  onPlayAll: (songs: Song[]) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.round(width * 0.43);

  if (!songs.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title={title} subtitle={subtitle} onPlayAll={() => onPlayAll(songs)} />
      <FlatList
        data={songs}
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD }}
        keyExtractor={(song) => song.id}
        ItemSeparatorComponent={renderGap}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={{ width: cardWidth }}
            activeOpacity={0.85}
            onPress={() => onPlay(songs, index)}
          >
            <View style={styles.squareThumb}>
              <Cover song={item} size={cardWidth} radius={8} />
            </View>
            <Text style={styles.squareTitle} numberOfLines={1} ellipsizeMode="tail">
              {item.title}
            </Text>
            <Text style={styles.squareSub} numberOfLines={2} ellipsizeMode="tail">
              {item.artist}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
});

// ---------- Arrangement: You Heard This (YouTube stream history) ----------
const YouHeardThisSection = memo(function YouHeardThisSection({
  songs,
  onPlay,
  onSeeAll,
}: {
  songs: Song[];
  onPlay: (song: Song, index: number) => void;
  onSeeAll: () => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(150, Math.round(width * 0.38));

  if (!songs || songs.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.sectionKicker}>STREAMED & CACHED</Text>
          <Text style={styles.sectionTitle} numberOfLines={1}>
            You heard this
          </Text>
        </View>
        <TouchableOpacity
          style={styles.seeAllBtn}
          activeOpacity={0.8}
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel="See all streamed songs"
        >
          <Text style={styles.seeAllText}>See all</Text>
          <Ionicons name="chevron-forward" size={13} color={MOON.primarySoft} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={songs.slice(0, 5)}
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        initialNumToRender={5}
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD }}
        keyExtractor={(song) => song.id}
        ItemSeparatorComponent={renderGap}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={{ width: cardWidth }}
            activeOpacity={0.85}
            onPress={() => onPlay(item, index)}
          >
            <View style={[styles.squareThumb, { width: cardWidth, height: cardWidth, borderRadius: 12 }]}>
              <Cover song={item} size={cardWidth} radius={12} />
              <View style={styles.cardPlayOverlay}>
                <Ionicons name="play" size={16} color="#fff" />
              </View>
            </View>
            <Text style={styles.squareTitle} numberOfLines={1} ellipsizeMode="tail">
              {item.title}
            </Text>
            <Text style={styles.squareSub} numberOfLines={1} ellipsizeMode="tail">
              {item.artist}
            </Text>
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
  const ytHistory = useYouTubeHistory();
  const mood = MOODS.find((m) => m.id === moodId) ?? MOODS[0];
  // Top 5 recently added songs in the app
  const newSongs = useMemo(() => songs.slice(0, 5), [songs]);

  // Remaining other songs shuffled for the downside sections
  const remainingSongs = useMemo(() => (songs.length > 5 ? songs.slice(5) : songs), [songs]);
  const shuffledRemaining = useMemo(() => shuffleSongs(remainingSongs), [remainingSongs]);

  const romance = useMemo(() => pick(shuffledRemaining, 0, 10), [shuffledRemaining]);
  // 4 rows x 3 columns = 12 songs for Quick picks
  const quickPicks = useMemo(() => pick(shuffledRemaining, 3, 12), [shuffledRemaining]);
  const videos = useMemo(() => pick(shuffledRemaining, 7, 8), [shuffledRemaining]);

  // 4 Themed Trays: 3 rows x 3 columns = 9 songs each
  const loveSongs = useMemo(
    () =>
      filterSongsByKeywords(
        songs,
        [
          'love',
          'ishq',
          'romantic',
          'valentine',
          'mulaqat',
          'dil',
          'jaan',
          'sahiba',
          'ranjha',
          'raanjhan',
          'saath',
          'bairan',
          'heeriye',
          'romance',
        ],
        shuffledRemaining,
        9
      ),
    [songs, shuffledRemaining]
  );

  const partySongs = useMemo(
    () =>
      filterSongsByKeywords(
        songs,
        [
          'party',
          'dance',
          'daru',
          'badnaam',
          'swalla',
          'taki',
          'nachu',
          'wedding',
          'garba',
          'navratri',
          'remix',
          'club',
          'bass',
          'dj',
          'fire',
          'mega',
          'reels',
        ],
        shuffledRemaining,
        9
      ),
    [songs, shuffledRemaining]
  );

  const hindiSongs = useMemo(
    () =>
      filterSongsByKeywords(
        songs,
        [
          'bollywood',
          'hindi',
          'arijit',
          'darshan',
          'vishal mishra',
          'shreya',
          'dunki',
          'kabir',
          'deepika',
          'ranbir',
          'pee loon',
          'zaalima',
          'chaleya',
          'khat',
          'kaise hua',
          'gehra hua',
          'sitaare',
          'saiyaara',
        ],
        shuffledRemaining,
        9
      ),
    [songs, shuffledRemaining]
  );

  const punjabiSongs = useMemo(
    () =>
      filterSongsByKeywords(
        songs,
        [
          'punjabi',
          'shubh',
          'imran khan',
          'karan aujla',
          'talwiinder',
          'talha anjum',
          'amplifier',
          'dil diyaan',
          'tareefan',
          'sohna',
          'maan meri jaan',
          'kalyani',
          'suniyan',
          'kaakan',
          'wishes',
          'afsos',
          'departure lane',
        ],
        shuffledRemaining,
        9
      ),
    [songs, shuffledRemaining]
  );

  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [activeNotif, setActiveNotif] = useState<{
    id: string;
    title: string;
    tagline: string;
    imageUrl?: string;
    songId?: string;
  } | null>(null);
  const [hasUnreadNotif, setHasUnreadNotif] = useState(false);
  const [heroConfig, setHeroConfig] = useState<HeroBannerConfig | null>(null);

  // Load Hero Banner Config (Cached + Remote)
  useEffect(() => {
    void (async () => {
      const cached = await getCachedHeroConfig();
      if (cached) setHeroConfig(cached);
      const remote = await fetchHeroConfig();
      if (remote) setHeroConfig(remote);
    })();
  }, []);

  const heroSongs = useMemo(() => {
    if (heroConfig?.mode === 'custom' && heroConfig.songIds?.length) {
      const customPicked = heroConfig.songIds
        .map((id) => songs.find((s) => s.id === id))
        .filter((s): s is Song => Boolean(s));
      if (customPicked.length > 0) return customPicked;
    }
    // Auto fallback: 3 newest songs from Drive
    return songs.slice(0, 3);
  }, [heroConfig, songs]);

  const heroKicker = heroConfig?.kicker || '🔥 TRENDING TONIGHT';
  const heroTitle = heroConfig?.title || 'Midnight Mashups Mix';
  const heroSub =
    heroConfig?.subtitle ||
    (heroSongs.length
      ? heroSongs.map((s) => s.title.split(' x ')[0].trim()).join(' • ')
      : 'Top romantic & soulful mashups');

  // Request permissions on launch + check active broadcast notification
  useEffect(() => {
    void requestInitialPermissions();

    void (async () => {
      try {
        const notif = await fetchActiveNotification();
        if (notif && notif.active !== false) {
          const personalized = await getPersonalizedNotification(notif);
          setActiveNotif({ ...personalized, id: notif.id });
          const lastSeenId = await getLastSeenNotificationId();
          setHasUnreadNotif(lastSeenId !== notif.id);
        }
      } catch {}
    })();
  }, []);

  // Prefetch covers for zero-delay instant display using direct Google CDN
  useEffect(() => {
    if (songs.length > 0) {
      const topThumbnails = songs
        .slice(0, 20)
        .map((s) => toDirectCdnUrl(s.thumb || s.coverUrl, 'w300'))
        .filter((u): u is string => Boolean(u));
      void Image.prefetch(topThumbnails, 'memory-disk');
    }
  }, [songs]);

  useEffect(() => {
    const state = playerStore.getState();
    if (state.loading) return;
    if (state.error) {
      void playerStore.loadSongs(true);
    } else if (!state.loaded) {
      void playerStore.loadSongs();
    }
  }, []);

  const playFrom = useCallback((list: Song[], index: number) => {
    if (!list[index]) return;
    playerStore.playQueue(list, index);
    router.push('/player');
  }, [router]);

  const playAll = useCallback((list: Song[]) => playFrom(list, 0), [playFrom]);

  return (
    <LinearGradient
      colors={['#1b1040', MOON.bg, MOON.bg]}
      locations={[0, 0.4, 1]}
      style={styles.container}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <StatusBar style="light" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: current ? 110 : 80 }}
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
            <View style={styles.headerIcons}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setNotifModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
                hitSlop={8}
              >
                <Ionicons
                  name={hasUnreadNotif ? 'notifications' : 'notifications-outline'}
                  size={19}
                  color={hasUnreadNotif ? '#fef3c7' : MOON.primarySoft}
                />
                {hasUnreadNotif && <View style={styles.unreadDot} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => void playerStore.loadSongs(true)}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Refresh songs and dashboard updates"
                hitSlop={8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={MOON.primarySoft} />
                ) : (
                  <Ionicons name="refresh" size={19} color={MOON.primarySoft} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.tagline}>Music for the midnight mood</Text>

          {/* Mood selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.moodRow}
            nestedScrollEnabled
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

          {/* Apple Music Style 3D Overlapping Glass Hero Card */}
          <TouchableOpacity
            activeOpacity={0.92}
            disabled={songs.length === 0 && !current}
            onPress={() => {
              if (current) {
                router.push('/player');
              } else if (heroSongs.length) {
                playFrom(heroSongs, 0);
              } else {
                playFrom(shuffledRemaining, 0);
              }
            }}
            style={styles.heroWrap}
          >
            <View style={styles.heroGlassCard}>
              {/* Ambient radial glow background */}
              <LinearGradient
                colors={['rgba(139,92,246,0.38)', 'rgba(192,38,211,0.18)', 'transparent']}
                start={{ x: 0.85, y: 0.1 }}
                end={{ x: 0.1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />

              {/* Left Column (60%): Kicker, Main Title, Subtitle, Play Pill */}
              <View style={styles.heroContentLeft}>
                <View style={styles.heroBadgePill}>
                  <View style={styles.heroBadgeDot} />
                  <Text style={styles.heroBadgeText} numberOfLines={1}>
                    {heroKicker}
                  </Text>
                </View>

                <Text style={styles.heroMainTitle} numberOfLines={2}>
                  {current ? current.title : (heroTitle || mood.title)}
                </Text>

                <Text style={styles.heroMainSub} numberOfLines={1}>
                  {current ? current.artist : heroSub}
                </Text>

                <View style={styles.heroPlayActionBtn}>
                  {loading && !current ? (
                    <ActivityIndicator size="small" color="#08060f" />
                  ) : (
                    <Ionicons
                      name={current && playing ? 'pause' : 'play'}
                      size={13}
                      color="#08060f"
                      style={{ marginLeft: 2 }}
                    />
                  )}
                  <Text style={styles.heroPlayActionText}>
                    {current ? (playing ? 'Pause' : 'Resume') : 'Play Mix'}
                  </Text>
                </View>
              </View>

              {/* Right Column (40%): 3D Overlapping Glass Album Cards */}
              <View style={styles.heroDeck3d}>
                {/* Card 3 (Back Right, rotated +14°) */}
                {heroSongs[2] && (
                  <View style={[styles.deckCardWrapper, styles.deckCardBack]}>
                    <Cover song={heroSongs[2]} size={76} radius={14} />
                    <View style={styles.deckCardBackDim} />
                  </View>
                )}

                {/* Card 2 (Middle Left, rotated -10°) */}
                {heroSongs[1] && (
                  <View style={[styles.deckCardWrapper, styles.deckCardMid]}>
                    <Cover song={heroSongs[1]} size={82} radius={16} />
                    <View style={styles.deckCardMidDim} />
                  </View>
                )}

                {/* Card 1 (Front Hero, upright +2°, elevated glow) */}
                {heroSongs[0] && (
                  <View style={[styles.deckCardWrapper, styles.deckCardFront]}>
                    <Cover song={heroSongs[0]} size={90} radius={18} />
                    <View style={styles.deckCardFrontBorder} />
                    {/* Live Equalizer indicator if playing */}
                    {playing && (
                      <View style={styles.deckPlayingEqualizer}>
                        <View style={[styles.deckEqBar, { height: 7 }]} />
                        <View style={[styles.deckEqBar, { height: 13 }]} />
                        <View style={[styles.deckEqBar, { height: 9 }]} />
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* You Heard This: Only rendered if user has streamed YouTube songs */}
          {ytHistory.length > 0 && (
            <YouHeardThisSection
              songs={ytHistory}
              onPlay={(_song, index) => {
                playerStore.playQueue(ytHistory, index);
              }}
              onSeeAll={() => {
                router.push('/recently-heard' as any);
              }}
            />
          )}

          {/* Arrangement 3: square carousels at the very top */}
          <SquareSection
            title="New"
            subtitle="RECENTLY ADDED"
            songs={newSongs}
            onPlay={playFrom}
            onPlayAll={playAll}
          />
          <SquareSection
            title="Bollywood Romance"
            subtitle="HANDPICKED"
            songs={romance}
            onPlay={playFrom}
            onPlayAll={playAll}
          />

          {/* Arrangement 1: paginated grids */}
          <GridSection
            title="Quick picks"
            subtitle="START RADIO FROM A SONG"
            songs={quickPicks}
            rows={4}
            columnsCount={3}
            unit="plays"
            onPlay={playFrom}
            onPlayAll={playAll}
          />

          {/* Arrangement 2: 16:9 video carousel */}
          <VideoSection
            title="Music videos for you"
            subtitle="WATCH & LISTEN"
            songs={videos}
            onPlay={playFrom}
            onPlayAll={playAll}
          />

          {/* 4 Themed Trays: 3 rows x 3 columns */}
          <GridSection
            title="Love"
            subtitle="ROMANTIC VIBES"
            songs={loveSongs}
            rows={3}
            columnsCount={3}
            unit="plays"
            onPlay={playFrom}
            onPlayAll={playAll}
          />
          <GridSection
            title="Party"
            subtitle="HIGH ENERGY & CLUB"
            songs={partySongs}
            rows={3}
            columnsCount={3}
            unit="views"
            onPlay={playFrom}
            onPlayAll={playAll}
          />
          <GridSection
            title="Hindi"
            subtitle="BOLLYWOOD FAVORITES"
            songs={hindiSongs}
            rows={3}
            columnsCount={3}
            unit="plays"
            onPlay={playFrom}
            onPlayAll={playAll}
          />
          <GridSection
            title="Punjabi"
            subtitle="DESI BEATS & SWAG"
            songs={punjabiSongs}
            rows={3}
            columnsCount={3}
            unit="views"
            onPlay={playFrom}
            onPlayAll={playAll}
          />

          {!loading && !songs.length && (
            <View style={styles.emptyLibrary}>
              <Ionicons name={error ? 'cloud-offline-outline' : 'musical-notes-outline'} size={28} color={MOON.primarySoft} />
              <Text style={styles.emptyLibraryText}>
                {error || 'No songs found in your shared Drive folder.'}
              </Text>
              {!!error && (
                <TouchableOpacity onPress={() => void playerStore.loadSongs(true)} hitSlop={10}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerDivider} />
            <View style={styles.footerBrand}>
              <Image
                source={require('@/assets/images/moonlight-logo.png')}
                style={styles.footerLogo}
                contentFit="contain"
              />
              <Text style={styles.footerBrandName}>MOONLIGHT</Text>
            </View>
            <Text style={styles.footerCopyright}>
              © {new Date().getFullYear()} MOONLIGHT • All rights reserved
            </Text>
            <Text style={styles.footerCredit}>
              Developed by <Text style={styles.footerAuthor}>Anish Kumawat</Text>
            </Text>
          </View>
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
                hitSlop={8}
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

        {/* Notifications Modal */}
        <Modal
          visible={notifModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setNotifModalVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setNotifModalVisible(false)}
          >
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <View style={styles.modalIconWrap}>
                    <Ionicons name="notifications" size={18} color="#fef3c7" />
                  </View>
                  <Text style={styles.modalTitle}>Notifications</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setNotifModalVisible(false)}
                  style={styles.modalCloseBtn}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={MOON.textDim} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                {activeNotif ? (
                  <View style={styles.featuredNotifCard}>
                    <View style={styles.featuredBadgeRow}>
                      <View style={styles.liveChip}>
                        <View style={styles.liveDot} />
                        <Text style={styles.featuredBadgeText}>LATEST RELEASE</Text>
                      </View>
                      <Text style={styles.featuredTime}>Just now</Text>
                    </View>
                    <Text style={styles.featuredNotifTitle}>{activeNotif.title}</Text>
                    <Text style={styles.featuredNotifTagline}>{activeNotif.tagline}</Text>
                    {Boolean(activeNotif.songId) && (
                      <TouchableOpacity
                        style={styles.featuredPlayBtn}
                        activeOpacity={0.85}
                        onPress={async () => {
                          setNotifModalVisible(false);
                          if (activeNotif?.id) {
                            await markNotificationAsSeen(activeNotif.id);
                            setHasUnreadNotif(false);
                          }
                          const idx = songs.findIndex((s) => s.id === activeNotif.songId);
                          if (idx >= 0) {
                            playerStore.playQueue(songs, idx);
                            router.push('/player');
                          }
                        }}
                      >
                        <Ionicons name="play" size={13} color="#1b1040" style={{ marginRight: 6 }} />
                        <Text style={styles.featuredPlayText}>Play Featured Song</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyNotifBox}>
                    <Ionicons name="notifications-outline" size={36} color={MOON.textDim} style={{ marginBottom: 6 }} />
                    <Text style={styles.emptyNotifTitle}>No New Notifications</Text>
                    <Text style={styles.emptyNotifSub}>
                      You are all caught up! New releases and announcements will appear here.
                    </Text>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                style={styles.modalDismissBtn}
                activeOpacity={0.85}
                onPress={async () => {
                  if (activeNotif?.id) {
                    await markNotificationAsSeen(activeNotif.id);
                    setHasUnreadNotif(false);
                  }
                  setNotifModalVisible(false);
                }}
              >
                <Text style={styles.modalDismissText}>Mark all as read</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

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
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f43f5e',
    borderWidth: 1.5,
    borderColor: '#1a1430',
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

  heroWrap: { paddingHorizontal: 16, marginTop: 4 },
  heroGlassCard: {
    borderRadius: 28,
    padding: 20,
    minHeight: 195,
    backgroundColor: '#160c2e',
    borderWidth: 1.5,
    borderColor: 'rgba(167,139,250,0.32)',
    overflow: 'hidden',
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  heroContentLeft: {
    flex: 1,
    paddingRight: 10,
    justifyContent: 'center',
    zIndex: 2,
  },
  heroBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(139,92,246,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.45)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  heroBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fef3c7',
    marginRight: 6,
  },
  heroBadgeText: {
    color: '#fef3c7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  heroMainTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 25,
    marginBottom: 4,
  },
  heroMainSub: {
    color: MOON.primarySoft,
    fontSize: 12.5,
    fontWeight: '500',
    marginBottom: 14,
  },
  heroPlayActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  heroPlayActionText: {
    color: '#08060f',
    fontSize: 12.5,
    fontWeight: '800',
    marginLeft: 6,
  },
  // 3D Deck Container
  heroDeck3d: {
    width: 124,
    height: 124,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  deckCardWrapper: {
    position: 'absolute',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  deckCardBack: {
    top: 6,
    right: -4,
    transform: [{ rotate: '14deg' }, { scale: 0.82 }],
    zIndex: 1,
    borderColor: 'rgba(167,139,250,0.3)',
  },
  deckCardBackDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,6,15,0.35)',
    borderRadius: 14,
  },
  deckCardMid: {
    top: 14,
    left: 4,
    transform: [{ rotate: '-10deg' }, { scale: 0.9 }],
    zIndex: 2,
    borderColor: 'rgba(254,243,199,0.35)',
  },
  deckCardMidDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,6,15,0.18)',
    borderRadius: 16,
  },
  deckCardFront: {
    top: 18,
    left: 18,
    transform: [{ rotate: '2deg' }],
    zIndex: 3,
    borderColor: 'rgba(255,255,255,0.65)',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.65,
    shadowRadius: 16,
    elevation: 10,
  },
  deckCardFrontBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  deckPlayingEqualizer: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2.5,
    backgroundColor: 'rgba(8,6,15,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deckEqBar: {
    width: 2.5,
    backgroundColor: '#4ade80',
    borderRadius: 1,
  },

  // ----- Sections -----
  section: { marginTop: 28 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIDE_PAD,
    marginBottom: 14,
  },
  sectionKicker: {
    color: MOON.textDim,
    fontSize: 10,
    letterSpacing: 1.6,
    marginBottom: 2,
  },
  sectionTitle: {
    color: MOON.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: MOON.primarySoft,
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  playAllText: { color: MOON.primarySoft, fontSize: 12, fontWeight: '700', marginLeft: 6 },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    backgroundColor: 'rgba(139,92,246,0.1)',
  },
  seeAllText: {
    color: MOON.primarySoft,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 2,
  },
  cardPlayOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Arrangement 1 – song row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
  },
  rowMid: { flex: 1, marginHorizontal: 12, overflow: 'hidden' },
  rowTitle: { color: MOON.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: MOON.textDim, fontSize: 12, marginTop: 3 },
  rowMenu: { paddingLeft: 4, justifyContent: 'center', alignItems: 'flex-end' },

  // Arrangement 2 – 16:9 video card
  videoThumb: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: MOON.card,
    borderWidth: 1,
    borderColor: MOON.cardBorder,
  },
  videoArt: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTitle: { color: MOON.text, fontSize: 14, fontWeight: 'bold', marginTop: 8 },
  videoSub: { color: MOON.textDim, fontSize: 12, marginTop: 2 },

  // Arrangement 3 – square card
  squareThumb: {
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: MOON.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  squareTitle: { color: MOON.text, fontSize: 14, fontWeight: 'bold', marginTop: 10 },
  squareSub: { color: MOON.textDim, fontSize: 12, marginTop: 2 },

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

  footer: {
    marginTop: 40,
    marginBottom: 16,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  footerDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(167,139,250,0.12)',
    marginBottom: 20,
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  footerLogo: {
    width: 22,
    height: 22,
    marginRight: 8,
    opacity: 0.85,
  },
  footerBrandName: {
    color: MOON.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  footerCopyright: {
    color: MOON.textDim,
    fontSize: 12,
    marginTop: 4,
  },
  footerCredit: {
    color: MOON.textDim,
    fontSize: 12,
    marginTop: 4,
  },
  footerAuthor: {
    color: MOON.primarySoft,
    fontWeight: '600',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#16102a',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    padding: 20,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139,92,246,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredNotifCard: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  featuredBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244,63,94,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f43f5e',
  },
  featuredBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fecdd3',
    letterSpacing: 0.6,
  },
  featuredTime: {
    fontSize: 10,
    color: MOON.textDim,
  },
  featuredNotifTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  featuredNotifTagline: {
    fontSize: 13,
    color: '#e9d5ff',
    lineHeight: 18,
    marginBottom: 10,
  },
  featuredPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: MOON.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  featuredPlayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1b1040',
  },
  emptyNotifBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  emptyNotifTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 8,
    marginBottom: 4,
  },
  emptyNotifSub: {
    fontSize: 12,
    color: MOON.textDim,
    textAlign: 'center',
    lineHeight: 17,
  },
  modalDismissBtn: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDismissText: {
    color: MOON.primarySoft,
    fontSize: 13,
    fontWeight: '600',
  },
});
