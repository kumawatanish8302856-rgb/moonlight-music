import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { memo, useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Cover from '../components/Cover';
import { isSongCached } from '../lib/audioCache';
import { hapticLight, hapticMedium } from '../lib/haptics';
import { playerStore, usePlayback, usePlaying } from '../lib/playerStore';
import {
  clearYouTubeHistory,
  useYouTubeHistory,
  type YouTubeHistorySong,
} from '../lib/youtubeHistory';

const MOON = {
  bg: '#08060f',
  card: '#161226',
  cardBorder: 'rgba(167,139,250,0.15)',
  primary: '#8b5cf6',
  primarySoft: '#a78bfa',
  text: '#f5f3ff',
  textDim: '#a89fc7',
};

const HistoryRow = memo(function HistoryRow({
  song,
  index,
  isPlayingThis,
  onPress,
}: {
  song: YouTubeHistorySong;
  index: number;
  isPlayingThis: boolean;
  onPress: () => void;
}) {
  const [cached, setCached] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    void isSongCached(song.id).then((isC) => {
      if (active) setCached(isC);
    });
    return () => {
      active = false;
    };
  }, [song.id]);

  return (
    <TouchableOpacity
      style={[styles.row, isPlayingThis && styles.rowActive]}
      activeOpacity={0.75}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Play ${song.title}`}
    >
      <View style={styles.coverWrap}>
        <Cover song={song} size={52} radius={10} />
        {isPlayingThis && (
          <View style={styles.playingOverlay}>
            <Ionicons name="volume-high" size={18} color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.rowMid}>
        <Text
          style={[styles.rowTitle, isPlayingThis && { color: MOON.primarySoft }]}
          numberOfLines={1}
        >
          {song.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {song.artist}
        </Text>
        <View style={styles.badgeRow}>
          {cached ? (
            <View style={styles.cachedBadge}>
              <Ionicons name="checkmark-circle" size={11} color="#34d399" />
              <Text style={styles.cachedText}>Cached Offline</Text>
            </View>
          ) : (
            <View style={styles.streamBadge}>
              <Ionicons name="cloud-download-outline" size={11} color={MOON.primarySoft} />
              <Text style={styles.streamText}>Caching...</Text>
            </View>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.playBtn}
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Play song"
      >
        <Ionicons
          name={isPlayingThis ? 'pause-circle' : 'play-circle'}
          size={32}
          color={isPlayingThis ? MOON.primarySoft : MOON.textDim}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export default function RecentlyHeardScreen() {
  const router = useRouter();
  const history = useYouTubeHistory();
  const { current } = usePlayback();
  const playing = usePlaying();

  const handlePlayAll = () => {
    if (!history.length) return;
    hapticMedium();
    playerStore.playQueue(history, 0);
  };

  const handlePlayIndex = (index: number) => {
    hapticLight();
    playerStore.playQueue(history, index);
  };

  const handleClear = () => {
    hapticLight();
    void clearYouTubeHistory();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={MOON.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>You Heard This</Text>
          <Text style={styles.headerSubtitle}>
            {history.length} {history.length === 1 ? 'song' : 'songs'} cached on phone
          </Text>
        </View>

        {history.length > 0 ? (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear history"
          >
            <Ionicons name="trash-outline" size={19} color={MOON.textDim} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* Play All Button Bar */}
      {history.length > 0 && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.playAllButton}
            activeOpacity={0.85}
            onPress={handlePlayAll}
            accessibilityRole="button"
            accessibilityLabel="Play all cached songs"
          >
            <LinearGradient
              colors={['#8b5cf6', '#c026d3']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.playAllGrad}
            >
              <Ionicons name="play" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.playAllText}>Play All</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Body List */}
      {history.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="headset-outline" size={54} color={MOON.primarySoft} />
          <Text style={styles.emptyTitle}>No Streamed Songs Yet</Text>
          <Text style={styles.emptySub}>
            Songs you search and stream will be saved here automatically for instant replay and offline playback.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <HistoryRow
              song={item}
              index={index}
              isPlayingThis={Boolean(current?.id === item.id && playing)}
              onPress={() => handlePlayIndex(index)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MOON.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: MOON.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: MOON.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  clearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  playAllButton: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  playAllGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 22,
  },
  playAllText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MOON.card,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: MOON.cardBorder,
  },
  rowActive: {
    borderColor: MOON.primarySoft,
    backgroundColor: '#20183b',
  },
  coverWrap: {
    position: 'relative',
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
  },
  playingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(139,92,246,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMid: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  rowTitle: {
    color: MOON.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    color: MOON.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52,211,153,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  cachedText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '600',
  },
  streamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167,139,250,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  streamText: {
    color: MOON.primarySoft,
    fontSize: 10,
    fontWeight: '600',
  },
  playBtn: {
    padding: 4,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyTitle: {
    color: MOON.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySub: {
    color: MOON.textDim,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  },
});
