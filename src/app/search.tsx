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
import { searchSongs, songsByTag, songsErrorMessage } from '../lib/songs';
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
  const [failedThumbUri, setFailedThumbUri] = useState<string | null>(null);
  const showThumb = !!song.thumb && failedThumbUri !== song.thumb;

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onPlay(index)}>
      {showThumb ? (
        <Image
          source={{ uri: song.thumb }}
          style={styles.thumb}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          onError={() => setFailedThumbUri(song.thumb ?? null)}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="musical-notes" size={24} color={MOON.primarySoft} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={styles.songTitle} numberOfLines={2}>
          {song.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
      <Ionicons name="play-circle" size={30} color={MOON.primarySoft} />
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
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<Song[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recents, setRecents] = useState<string[]>([
    'Arijit Singh',
    'Chill',
    'Punjabi',
    'Love songs',
  ]);

  const reqId = useRef(0);
  const [retryKey, setRetryKey] = useState(0);

  // Reuse the app-wide Drive library instead of fetching it again for Search.
  useEffect(() => {
    const state = playerStore.getState();
    if (state.error) {
      void playerStore.loadSongs(true);
    } else if (!state.loaded && !state.loading) {
      void playerStore.loadSongs();
    }
  }, []);

  const addRecent = useCallback((q: string) => {
    setRecents((r) =>
      [q, ...r.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6)
    );
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
        const list = await searchSongs(
          q,
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
    }, 120);

    return () => clearTimeout(timer);
  }, [query, mode, retryKey, libraryLoaded, libraryError, librarySongs]);

  // ---------- Handlers ----------
  const onChangeText = useCallback((t: string) => {
    setMode('search');
    setQuery(t);
    if (!t.trim()) {
      reqId.current++;
      setResults(null);
      setError('');
      setLoading(false);
    }
  }, []);

  const onSubmit = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    addRecent(q);
  }, [query, addRecent]);

  const onRecentPress = useCallback(
    (r: string) => {
      Keyboard.dismiss();
      setMode('search');
      setQuery(r);
      addRecent(r);
    },
    [addRecent]
  );

  const runTag = useCallback(async (c: Category) => {
    Keyboard.dismiss();
    const id = ++reqId.current;
    setMode('tag');
    setQuery(c.title);
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const list = await songsByTag(
        c.tag,
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

  const clearAll = useCallback(() => {
    reqId.current++;
    setMode('search');
    setQuery('');
    setResults(null);
    setError('');
    setLoading(false);
  }, []);

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
      if (c) runTag(c);
    } else {
      void playerStore.loadSongs(true);
      setRetryKey((k) => k + 1);
    }
  }, [mode, query, runTag]);

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

  const header = useMemo(
    () => (
      <View style={styles.resultsHeader}>
        <Text style={styles.sectionTitleInline}>
          {mode === 'tag' ? query : 'Results'}
          {results ? `  •  ${results.length}` : ''}
        </Text>
        {!!results?.length && (
          <TouchableOpacity style={styles.playAll} onPress={onHeaderPlayPress} activeOpacity={0.85}>
            <Ionicons name={mode === 'tag' ? 'shuffle' : 'play'} size={14} color="#1b1040" />
            <Text style={styles.playAllText}>{mode === 'tag' ? 'Shuffle play' : 'Play all'}</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [mode, query, results, onHeaderPlayPress]
  );

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
            placeholder="Songs, artists, moods..."
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
                  <Text style={styles.sectionTitle}>Recent nights</Text>
                  <View style={styles.chipWrap}>
                    {recents.map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={styles.chip}
                        onPress={() => onRecentPress(r)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="time-outline" size={14} color={MOON.primarySoft} />
                        <Text style={styles.chipText}>{r}</Text>
                      </TouchableOpacity>
                    ))}
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
  sectionTitle: {
    color: MOON.text,
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    marginBottom: 14,
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

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MOON.card,
    borderWidth: 1,
    borderColor: MOON.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { color: MOON.text, fontSize: 13, marginLeft: 6 },

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
});
