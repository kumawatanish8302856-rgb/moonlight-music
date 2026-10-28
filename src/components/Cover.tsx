import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type CoverSong = {
  id: string;
  title?: string;
  artist?: string;
  coverUrl?: string;
  thumb?: string;
};

const GRADIENTS = [
  ['#8b5cf6', '#c026d3'],
  ['#f472b6', '#8b5cf6'],
  ['#22d3ee', '#6366f1'],
  ['#fb923c', '#e11d48'],
  ['#34d399', '#0ea5e9'],
  ['#312e81', '#7c3aed'],
] as const;

export function gradientFor(seed?: string | number): readonly [string, string] {
  const value = String(seed ?? 'M');
  const hash = Array.from(value).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

function getFastCoverUri(uri?: string, size = 300): { primary: string; fallback?: string } | null {
  if (!uri) return null;
  if (uri.includes('lh3.googleusercontent.com/d/')) {
    const cleaned = uri.replace(/=sw(\d+)/, '=w$1');
    return { primary: cleaned };
  }
  const match = uri.match(/[?&]id=([^&]+)/);
  if (match) {
    const fileId = match[1];
    const sizeParam = size <= 310 ? 'w300' : 'w800';
    return {
      primary: `https://lh3.googleusercontent.com/d/${fileId}=${sizeParam}`,
      fallback: uri,
    };
  }
  return { primary: uri };
}

const Cover = memo(function Cover({
  song,
  size,
  radius,
}: {
  song: CoverSong;
  size: number;
  radius: number;
}) {
  const rawUri = (size <= 310 ? song.thumb : song.coverUrl) || song.thumb || song.coverUrl;
  const uris = React.useMemo(() => getFastCoverUri(rawUri, size), [rawUri, size]);
  const [useFallback, setUseFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reset when song changes
  React.useEffect(() => {
    setUseFallback(false);
    setFailed(false);
  }, [rawUri]);

  const activeUri = uris ? (useFallback ? uris.fallback : uris.primary) : null;

  if (activeUri && !failed) {
    return (
      <Image
        source={{ uri: activeUri }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        transition={100}
        cachePolicy="memory-disk"
        priority={size <= 310 ? 'high' : 'normal'}
        onError={() => {
          if (!useFallback && uris?.fallback && uris.fallback !== uris.primary) {
            setUseFallback(true);
          } else {
            setFailed(true);
          }
        }}
      />
    );
  }

  const label = (song.title ?? 'M').slice(0, 1).toUpperCase();
  const fontSize = Math.max(12, Math.round(size * 0.44));

  return (
    <LinearGradient
      colors={gradientFor(song?.id)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.art, { width: size, height: size, borderRadius: radius }]}
    >
      <View style={styles.textWrap}>
        <Text style={[styles.text, { fontSize }]}>{label}</Text>
      </View>
    </LinearGradient>
  );
});

export default Cover;

const styles = StyleSheet.create({
  art: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  textWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '800',
    color: '#fff',
    opacity: 0.9,
  },
});
