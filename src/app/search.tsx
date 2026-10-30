import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomNav from '../components/BottomNav';
import {
  searchSongs,
  songsByTag,
  songsErrorMessage,
  searchYouTubeMusic,
  fetchYouTubeTrending,
} from '../lib/songs';
import { playerStore, Song, useLibrary } from '../lib/playerStore';

// ---------- Moonlight theme ----------
const MOON = {
  bg: '#08060f',
  card: '#1a1430',
  cardBorder: 'rgba(167,139,250,0.2)',
  primary: '#8b5cf6',
  primarySoft: '#a78bfa',
  text: '#f5f3ff',
  textDim: '#a89fc7',
};

type Grad = readonly [string, string];
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const G: Record<string, Grad> = {
  primary: ['#8b5cf6', '#c026d3'],
  sunset: ['#f472b6', '#8b5cf6'],
  ocean: ['#22d3ee', '#6366f1'],
  fire: ['#fb923c', '#e11d48'],
  forest: ['#34d399', '#0ea5e9'],
  night: ['#312e81', '#7c3aed'],
};

type Category = { id: string; title: string; tag: string; icon: IconName; grad: Grad };

const CATEGORIES: Category[] = [
  { id: '1', title: 'Bollywood', tag: 'bollywood', icon: 'film', grad: G.primary },
  { id: '2', title: 'Punjabi', tag: 'punjabi', icon: 'musical-notes', grad: G.fire },
  { id: '3', title: 'Hip-Hop', tag: 'hiphop', icon: 'mic', grad: G.night },
  { id: '4', title: 'Romance', tag: 'love', icon: 'heart', grad: G.sunset },
  { id: '5', title: 'Party', tag: 'party', icon: 'flame', grad: G.fire },
  { id: '6', title: 'Workout', tag: 'workout', icon: 'barbell', grad: G.forest },
  { id: '7', title: 'Chill', tag: 'chill', icon: 'water', grad: G.ocean },
  { id: '8', title: 'Devotional', tag: 'devotional', icon: 'flower', grad: G.sunset },
  { id: '9', title: 'Sad Songs', tag: 'sad', icon: 'rainy', grad: G.night },
  { id: '10', title: 'Pop', tag: 'pop', icon: 'sparkles', grad: G.primary },
];

const HEIGHTS = [130, 100, 115, 140, 105];
const LEFT = CATEGORIES.filter((_, i) => i % 2 === 0);
const RIGHT = CATEGORIES.filter((_, i) => i % 2 === 1);

// ---------- Memoized components ----------
const CategoryCard = memo(function CategoryCard({
  item,
  height,
  onPress,
}: {
  item: Category;
  height: number;
  onPress: (c: Category) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={{ marginBottom: 14 }}
      onPress={() => onPress(item)}
    >
      <LinearGradient
        colors={item.grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.catCard, { height }]}
      >
        <Ionicons
          name={item.icon}
          size={72}
          color="rgba(255,255,255,0.2)"
          style={styles.catIcon}
        />
        <Text style={styles.catText}>{item.title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
});

const SongRow = memo(function SongRow({
  song,
  index,
  onPlay,
}: {
  song: Song;
  index: number;
  onPlay: (i: number) => void;
}) {
  const thumbUri = song.thumb || song.coverUrl;
  const [failedThumbUri, setFailedThumbUri] = useState<string | null>(null);
  const showThumb = !!thumbUri && failedThumbUri !== thumbUri;

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onPlay(index)}>
      {showThumb ? (
        <Image
          source={{ uri: thumbUri }}
          style={styles.thumb}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          onError={() => setFailedThumbUri(thumbUri ?? null)}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons
            name={song.source === 'youtube' ? 'logo-youtube' : 'musical-notes'}
            size={24}
            color={song.source === 'youtube' ? '#ef4444' : MOON.primarySoft}
          />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={styles.songTitle} numberOfLines={2}>
          {song.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
          {song.source === 'youtube' && (
            <View style={styles.ytBadge}>
              <Ionicons name="logo-youtube" size={10} color="#ff0033" />
              <Text style={styles.ytBadgeText}>YT Music</Text>
            </View>
          )}
          <Text style={[styles.songArtist, { flex: 1 }]} numberOfLines={1}>
            {song.artist}
          </Text>
        </View>
      </View>
      <Ionicons
        name="play-circle"
        size={30}
        color={song.source === 'youtube' ? '#f43f5e' : MOON.primarySoft}
      />
    </TouchableOpacity>
  );
});

// ---------- Screen ----------
export default function SearchScreen() {
  const router = useRouter();
  const {
    songs: librarySongs,
    loaded: libraryLoaded,
    error: libraryError,
  } = useLibrary();

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'search' | 'tag'>('search');
  const [searchSource, setSearchSource] = useState<'library' | 'youtube'>('youtube');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<Song[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);

  const reqId = useRef(0);
  const [retryKey, setRetryKey] = useState(0);

  // Fetch YouTube trending songs when screen opens
  useEffect(() => {
    let active = true;
    fetchYouTubeTrending('IN')
      .then((songs) => {
        if (active && songs.length > 0) {
          setTrendingSongs(songs);
          setResults((prev) => (prev === null ? songs : prev));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Reuse the app-wide Drive library instead of fetching it again for Search.
  useEffect(() => {
    const state = playerStore.getState();
    if (state.error) {
      void playerStore.loadSongs(true);
    } else if (!state.loaded && !state.loading) {
      void playerStore.loadSongs();
    }
  }, []);

  // ---------- Live search (debounced) ----------
  useEffect(() => {
    if (mode !== 'search') return;

    const q = query.trim();
    if (!q) return;

    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        if (searchSource === 'youtube') {
          const list = await searchYouTubeMusic(q);
          if (id !== reqId.current) return;
          setResults(list);
        } else {
          const list = await searchSongs(
            q,
            libraryLoaded && !libraryError ? librarySongs : undefined
          );
          if (id !== reqId.current) return;
          setResults(list);
        }
      } catch (err) {
        if (id !== reqId.current) return;
        setResults(null);
        setError(songsErrorMessage(err));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, searchSource === 'youtube' ? 300 : 120);

    return () => clearTimeout(timer);
  }, [query, mode, searchSource, retryKey, libraryLoaded, libraryError, librarySongs]);

  // ---------- Handlers ----------
  const onChangeText = useCallback(
    (t: string) => {
      setMode('search');
      setQuery(t);
      if (!t.trim()) {
        reqId.current++;
        setResults(searchSource === 'youtube' && trendingSongs.length > 0 ? trendingSongs : null);
        setError('');
        setLoading(false);
      }
    },
    [searchSource, trendingSongs]
  );

  const onSelectSource = useCallback(
    (source: 'library' | 'youtube') => {
      setSearchSource(source);
      setMode('search');
      setError('');
      const q = query.trim();
      if (!q) {
        setResults(source === 'youtube' && trendingSongs.length > 0 ? trendingSongs : null);
      }
    },
    [query, trendingSongs]
  );

  const onSubmit = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
  }, [query]);

  const runTagByName = useCallback(async (tag: string, displayTitle: string) => {
    Keyboard.dismiss();
    const id = ++reqId.current;
    setMode('tag');
    setQuery(displayTitle);
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const list = await songsByTag(
        tag,
        libraryLoaded && !libraryError ? librarySongs : undefined
      );
      if (id !== reqId.current) return;
      setResults(list);
    } catch (err) {
      if (id !== reqId.current) return;
      setResults(null);
      setError(songsErrorMessage(err));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [libraryLoaded, libraryError, librarySongs]);

  const runTag = useCallback(async (c: Category) => {
    await runTagByName(c.tag, c.title);
  }, [runTagByName]);

  const clearAll = useCallback(() => {
    reqId.current++;
    setMode('search');
    setQuery('');
    setResults(searchSource === 'youtube' && trendingSongs.length > 0 ? trendingSongs : null);
    setError('');
    setLoading(false);
  }, [searchSource, trendingSongs]);

  const playSong = useCallback(
    (index: number) => {
      if (!results?.length) return;
      Keyboard.dismiss();
      playerStore.playQueue(results, index);
      router.push('/player');
    },
    [results, router]
  );

  const retry = useCallback(() => {
    if (mode === 'tag') {
      const c = CATEGORIES.find((x) => x.title === query);
      if (c) {
        runTag(c);
      } else if (query === 'Singer Mashups') {
        runTagByName('singermashup', 'Singer Mashups');
      } else if (query === 'Playlists Mashups') {
        runTagByName('playlistmashup', 'Playlists Mashups');
      }
    } else {
      void playerStore.loadSongs(true);
      setRetryKey((k) => k + 1);
    }
  }, [mode, query, runTag, runTagByName]);

  const onHeaderPlayPress = useCallback(() => {
    if (!results?.length) return;
    Keyboard.dismiss();
    if (mode === 'tag') {
      playerStore.playShuffled(results);
    } else {
      playerStore.playQueue(results, 0);
    }
    router.push('/player');
  }, [results, mode, router]);

  const renderItem = useCallback(
    ({ item, index }: { item: Song; index: number }) => (
      <SongRow song={item} index={index} onPlay={playSong} />
    ),
    [playSong]
  );

  const keyExtractor = useCallback((s: Song) => s.id, []);

  // ---------- Derived ----------
  const showResults = !!results && !(loading && results.length === 0);
  const showBrowse = !loading && !results && !error;

  const header = useMemo(() => {
    const q = query.trim();
    let title = 'Results';
    if (mode === 'tag') {
      title = query;
    } else if (searchSource === 'youtube') {
      title = q ? 'YouTube Music' : '🔥 Trending on YouTube';
    }
    return (
      <View style={styles.resultsHeader}>
        <Text style={styles.sectionTitleInline}>
          {title}
          {results ? `  •  ${results.length}` : ''}
        </Text>
        {!!results?.length && (
          <TouchableOpacity style={styles.playAll} onPress={onHeaderPlayPress} activeOpacity={0.85}>
            <Ionicons name={mode === 'tag' ? 'shuffle' : 'play'} size={14} color="#1b1040" />
            <Text style={styles.playAllText}>{mode === 'tag' ? 'Shuffle play' : 'Play all'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [mode, query, searchSource, results, onHeaderPlayPress]);

  return (
    <LinearGradient
      colors={['#1b1040', MOON.bg, MOON.bg]}
      locations={[0, 0.35, 1]}
      style={styles.container}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <StatusBar style="light" />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.heading}>Discover</Text>
          <Text style={styles.sub}>Find your midnight sound</Text>
        </View>

        {/* Search bar */}
        <View style={[styles.searchBox, focused && styles.searchBoxFocused]}>
          <Ionicons name="search" size={20} color={MOON.primarySoft} />
          <TextInput
            style={styles.input}
            placeholder={
              searchSource === 'youtube'
                ? 'Search any song or artist on YouTube...'
                : 'Songs, artists, moods...'
            }
            placeholderTextColor={MOON.textDim}
            value={query}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            selectionColor={MOON.primary}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={clearAll} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={MOON.textDim} />
            </TouchableOpacity>
          )}
        </View>

        {/* Source Toggle Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.tabButton, searchSource === 'youtube' && styles.tabButtonActiveYoutube]}
            onPress={() => onSelectSource('youtube')}
          >
            <Ionicons
              name="logo-youtube"
              size={15}
              color={searchSource === 'youtube' ? '#ffffff' : '#ef4444'}
            />
            <Text
              style={[
                styles.tabButtonText,
                searchSource === 'youtube' && styles.tabButtonTextActive,
              ]}
            >
              YouTube Music ⚡
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.tabButton, searchSource === 'library' && styles.tabButtonActive]}
            onPress={() => onSelectSource('library')}
          >
            <Ionicons
              name="folder-open"
              size={15}
              color={searchSource === 'library' ? '#ffffff' : MOON.textDim}
            />
            <Text
              style={[
                styles.tabButtonText,
                searchSource === 'library' && styles.tabButtonTextActive,
              ]}
            >
              Moonlight Drive
            </Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        {showResults ? (
          <FlatList
            data={results!}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ListHeaderComponent={header}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="moon-outline" size={40} color={MOON.primarySoft} />
                <Text style={styles.centerText}>No songs found for: {query}</Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={6}
            removeClippedSubviews
            contentContainerStyle={{ paddingBottom: 24, paddingTop: 8 }}
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {loading && (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={MOON.primary} />
                <Text style={styles.centerText}>Searching songs...</Text>
              </View>
            )}

            {!loading && !!error && (
              <View style={styles.center}>
                <Ionicons name="cloud-offline-outline" size={40} color={MOON.primarySoft} />
                <Text style={styles.centerText}>{error}</Text>
                <TouchableOpacity style={styles.retry} onPress={retry} hitSlop={8}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            )}

            {showBrowse && (
              <>
                <View style={styles.block}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Featured Mashups</Text>
                    <View style={styles.featuredKickerPill}>
                      <Ionicons name="sparkles" size={11} color={MOON.primarySoft} style={{ marginRight: 4 }} />
                      <Text style={styles.featuredKickerText}>SPECIALS</Text>
                    </View>
                  </View>

                  <View style={styles.mashupCardsRow}>
                    {/* Card 1: Singer Mashups */}
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.mashupCardTouch}
                      onPress={() => runTagByName('singermashup', 'Singer Mashups')}
                    >
                      <View style={[styles.cardGlowWrapper, styles.singerCardGlow]}>
                        <LinearGradient
                          colors={['#271252', '#140a2c']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.mashupCard, styles.singerBorder]}
                        >
                          {/* Ambient luminous glow */}
                          <LinearGradient
                            colors={['rgba(139, 92, 246, 0.45)', 'rgba(99, 102, 241, 0.0)']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={styles.ambientGlow}
                          />

                          {/* Decorative radar waveform rings with mic */}
                          <View style={styles.radarGraphic} pointerEvents="none">
                            <View style={[styles.radarRingOuter, { borderColor: 'rgba(167, 139, 250, 0.18)' }]}>
                              <View style={[styles.radarRingInner, { borderColor: 'rgba(167, 139, 250, 0.38)' }]}>
                                <Ionicons name="mic" size={20} color="#c4b5fd" />
                              </View>
                            </View>
                          </View>

                          {/* Top row: badge + equalizer accent */}
                          <View style={styles.cardTopRow}>
                            <View style={[styles.mashupBadge, styles.singerBadge]}>
                              <Text style={styles.mashupBadgeText}>🎙️ ARTISTS</Text>
                            </View>
                            <View style={styles.equalizerRow}>
                              <View style={[styles.equalizerBar, { height: 7, backgroundColor: '#a78bfa' }]} />
                              <View style={[styles.equalizerBar, { height: 13, backgroundColor: '#c4b5fd' }]} />
                              <View style={[styles.equalizerBar, { height: 9, backgroundColor: '#a78bfa' }]} />
                            </View>
                          </View>

                          {/* Bottom row: text + interactive play CTA */}
                          <View style={styles.cardBottomRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={styles.mashupCardTitle} numberOfLines={1}>Singer Mashups</Text>
                              <Text style={styles.singerSub} numberOfLines={1}>Arijit • Darshan • King</Text>
                            </View>
                            <View style={[styles.cardPlayBtn, styles.singerPlayBtn]}>
                              <Ionicons name="play" size={13} color="#ffffff" style={{ marginLeft: 2 }} />
                            </View>
                          </View>
                        </LinearGradient>
                      </View>
                    </TouchableOpacity>

                    {/* Card 2: Playlists Mashups */}
                    <TouchableOpacity
                      activeOpacity={0.88}
                      style={styles.mashupCardTouch}
                      onPress={() => runTagByName('playlistmashup', 'Playlists Mashups')}
                    >
                      <View style={[styles.cardGlowWrapper, styles.playlistCardGlow]}>
                        <LinearGradient
                          colors={['#4a0e2e', '#1c0515']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.mashupCard, styles.playlistBorder]}
                        >
                          {/* Ambient luminous glow */}
                          <LinearGradient
                            colors={['rgba(244, 63, 94, 0.45)', 'rgba(251, 146, 60, 0.0)']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={styles.ambientGlow}
                          />

                          {/* Decorative vinyl grooves rings with disc */}
                          <View style={styles.radarGraphic} pointerEvents="none">
                            <View style={[styles.radarRingOuter, { borderColor: 'rgba(251, 113, 133, 0.18)' }]}>
                              <View style={[styles.radarRingInner, { borderColor: 'rgba(251, 113, 133, 0.38)' }]}>
                                <Ionicons name="disc" size={20} color="#fda4af" />
                              </View>
                            </View>
                          </View>

                          {/* Top row: badge + equalizer accent */}
                          <View style={styles.cardTopRow}>
                            <View style={[styles.mashupBadge, styles.playlistBadge]}>
                              <Text style={styles.mashupBadgeText}>🔥 PLAYLISTS</Text>
                            </View>
                            <View style={styles.equalizerRow}>
                              <View style={[styles.equalizerBar, { height: 9, backgroundColor: '#fb7185' }]} />
                              <View style={[styles.equalizerBar, { height: 14, backgroundColor: '#fda4af' }]} />
                              <View style={[styles.equalizerBar, { height: 6, backgroundColor: '#fb7185' }]} />
                            </View>
                          </View>

                          {/* Bottom row: text + interactive play CTA */}
                          <View style={styles.cardBottomRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={styles.mashupCardTitle} numberOfLines={1}>Playlists Mashups</Text>
                              <Text style={styles.playlistSub} numberOfLines={1}>Party • Non-stop • Hits</Text>
                            </View>
                            <View style={[styles.cardPlayBtn, styles.playlistPlayBtn]}>
                              <Ionicons name="play" size={13} color="#ffffff" style={{ marginLeft: 2 }} />
                            </View>
                          </View>
                        </LinearGradient>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.block}>
                  <Text style={styles.sectionTitle}>Browse by mood</Text>
                  <View style={styles.columns}>
                    <View style={styles.col}>
                      {LEFT.map((c, i) => (
                        <CategoryCard
                          key={c.id}
                          item={c}
                          height={HEIGHTS[(i * 2) % HEIGHTS.length]}
                          onPress={runTag}
                        />
                      ))}
                    </View>
                    <View style={styles.col}>
                      {RIGHT.map((c, i) => (
                        <CategoryCard
                          key={c.id}
                          item={c}
                          height={HEIGHTS[(i * 2 + 1) % HEIGHTS.length]}
                          onPress={runTag}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        )}

        <BottomNav active="search" />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { paddingHorizontal: 20, paddingTop: 14 },
  heading: { color: MOON.text, fontSize: 30, fontWeight: 'bold' },
  sub: { color: MOON.primarySoft, fontSize: 13, marginTop: 4, letterSpacing: 0.5 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: MOON.cardBorder,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 4,
    paddingHorizontal: 16,
    height: 52,
  },
  searchBoxFocused: {
    borderColor: MOON.primary,
    backgroundColor: 'rgba(139,92,246,0.12)',
  },
  input: { flex: 1, color: MOON.text, fontSize: 15, marginLeft: 10 },

  block: { marginTop: 24 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    color: MOON.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  featuredKickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
  },
  featuredKickerText: {
    color: MOON.primarySoft,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 10,
  },
  sectionTitleInline: { color: MOON.text, fontSize: 18, fontWeight: 'bold', flex: 1 },
  playAll: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  playAllText: { color: '#1b1040', fontWeight: 'bold', fontSize: 12, marginLeft: 6 },

  mashupCardsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  mashupCardTouch: {
    flex: 1,
  },
  cardGlowWrapper: {
    borderRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  singerCardGlow: {
    shadowColor: '#8b5cf6',
  },
  playlistCardGlow: {
    shadowColor: '#f43f5e',
  },
  mashupCard: {
    borderRadius: 24,
    padding: 16,
    height: 148,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  singerBorder: {
    borderColor: 'rgba(167, 139, 250, 0.35)',
  },
  playlistBorder: {
    borderColor: 'rgba(251, 113, 133, 0.35)',
  },
  ambientGlow: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  radarGraphic: {
    position: 'absolute',
    right: -10,
    top: -10,
  },
  radarRingOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRingInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mashupBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  singerBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.24)',
    borderColor: 'rgba(167, 139, 250, 0.4)',
  },
  playlistBadge: {
    backgroundColor: 'rgba(244, 63, 94, 0.24)',
    borderColor: 'rgba(251, 113, 133, 0.4)',
  },
  mashupBadgeText: {
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  equalizerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    paddingRight: 4,
  },
  equalizerBar: {
    width: 3,
    borderRadius: 2,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  mashupCardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.1,
  },
  singerSub: {
    color: '#c4b5fd',
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },
  playlistSub: {
    color: '#fda4af',
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },
  cardPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  singerPlayBtn: {
    backgroundColor: '#8b5cf6',
    shadowColor: '#8b5cf6',
  },
  playlistPlayBtn: {
    backgroundColor: '#f43f5e',
    shadowColor: '#f43f5e',
  },

  columns: { flexDirection: 'row', paddingHorizontal: 20 },
  col: { flex: 1 },
  catCard: {
    borderRadius: 24,
    padding: 16,
    marginHorizontal: 5,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  catIcon: { position: 'absolute', right: -6, top: -6 },
  catText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: MOON.card,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  songTitle: { color: MOON.text, fontSize: 15, fontWeight: '600' },
  songArtist: { color: MOON.textDim, fontSize: 13, marginTop: 3 },

  center: { alignItems: 'center', marginTop: 50, paddingHorizontal: 30 },
  centerText: { color: MOON.textDim, textAlign: 'center', marginTop: 14, fontSize: 14 },
  retry: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: MOON.cardBorder,
  },
  retryText: { color: MOON.primarySoft, fontWeight: '600', fontSize: 13 },

  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    gap: 10,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderColor: '#8b5cf6',
  },
  tabButtonActiveYoutube: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444',
  },
  tabButtonText: {
    color: MOON.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  ytBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  ytBadgeText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
