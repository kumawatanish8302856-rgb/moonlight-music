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

const Cover = memo(function Cover({
  song,
  size,
  radius,
}: {
  song: CoverSong;
  size: number;
  radius: number;
}) {
  // Use lightweight 300px thumb for small covers (<=120px) to boost performance and speed up loading
  const imageUri = (size <= 120 ? song.thumb : song.coverUrl) || song.thumb || song.coverUrl;
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null);

  if (imageUri && failedImageUri !== imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        onError={() => setFailedImageUri(imageUri)}
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
