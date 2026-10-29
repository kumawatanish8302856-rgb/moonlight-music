import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import React, { memo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { MOON } from '../constants/moonlight';
import { hapticLight, hapticMedium, hapticSuccess } from '../lib/haptics';
import type { Song } from '../lib/songs';
import Cover from './Cover';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 64, 300);
const CARD_ART_SIZE = CARD_WIDTH - 48;

type ShareStoryModalProps = {
  visible: boolean;
  song: Song | null;
  onClose: () => void;
};

const ShareStoryModal = memo(function ShareStoryModal({
  visible,
  song,
  onClose,
}: ShareStoryModalProps) {
  const cardRef = useRef<any>(null);
  const [sharingImage, setSharingImage] = useState(false);

  if (!song) return null;

  const handleShareStory = async () => {
    hapticMedium();
    if (!cardRef.current) return;

    try {
      setSharingImage(true);
      const uri = typeof cardRef.current.capture === 'function'
        ? await cardRef.current.capture()
        : await captureRef(cardRef.current, {
            format: 'png',
            quality: 0.95,
            result: 'tmpfile',
          });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        hapticSuccess();
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Share "${song.title}" on WhatsApp / Instagram Story`,
          UTI: 'public.png',
        });
      } else {
        // Fallback to text share if native image sharing is unavailable
        await Share.share({
          message: `\uD83C\uDFA7 Listening to "${song.title}" by ${song.artist} on Moonlight! \uD83C\uDF19\u2728\nEnjoy Bollywood & Chill Mashups on Moonlight.`,
        });
      }
    } catch (err: unknown) {
      const errorMsg = String(err);
      if (!errorMsg.includes('User did not share') && !errorMsg.includes('canceled')) {
        Alert.alert('Share', 'Could not generate story card. Sharing as link instead.', [
          {
            text: 'Share Link',
            onPress: () => {
              void Share.share({
                message: `\uD83C\uDFA7 Listening to "${song.title}" by ${song.artist} on Moonlight! \uD83C\uDF19\u2728`,
              });
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    } finally {
      setSharingImage(false);
    }
  };

  const handleShareText = async () => {
    hapticLight();
    try {
      await Share.share({
        message: `\uD83C\uDFA7 Listening to "${song.title}" by ${song.artist} on Moonlight! \uD83C\uDF19\u2728\nStream uninterrupted Bollywood & Chill Mashups now!`,
      });
    } catch {}
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.topHeader}>
            <View style={styles.headerTitleWrap}>
              <Ionicons name="sparkles" size={17} color="#c084fc" />
              <Text style={styles.headerTitle}>Share Story Card</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={20} color={MOON.textDim} />
            </TouchableOpacity>
          </View>

          {/* Aesthetic Story Card (Captured via ViewShot ref) */}
          <View style={styles.cardWrapper}>
            <ViewShot
              ref={cardRef}
              options={{ format: 'png', quality: 0.95, result: 'tmpfile' }}
              style={styles.storyCard}
            >
              <LinearGradient
                colors={['#1c123d', '#100b26', '#080512']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />

              {/* Brand Top */}
              <View style={styles.cardBrandRow}>
                <View style={styles.brandBadge}>
                  <Ionicons name="moon" size={13} color="#fef08a" />
                  <Text style={styles.brandName}>MOONLIGHT</Text>
                </View>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>NOW PLAYING</Text>
                </View>
              </View>

              {/* Cover Artwork */}
              <View style={styles.artContainer}>
                <Cover song={song} size={CARD_ART_SIZE} radius={20} />
              </View>

              {/* Song Details */}
              <View style={styles.songInfo}>
                <Text style={styles.songTitle} numberOfLines={2}>
                  {song.title}
                </Text>
                <Text style={styles.songArtist} numberOfLines={1}>
                  {song.artist}
                </Text>
              </View>

              {/* Waveform graphic */}
              <View style={styles.waveRow}>
                {[14, 26, 18, 32, 22, 28, 16, 24, 12].map((height, i) => (
                  <LinearGradient
                    key={i}
                    colors={['#c084fc', '#f43f5e']}
                    style={[styles.waveBar, { height }]}
                  />
                ))}
              </View>

              {/* Bottom Tag */}
              <View style={styles.cardFooter}>
                <View style={styles.footerTag}>
                  <Text style={styles.footerText}>\uD83C\uDF19 Listening on Moonlight</Text>
                </View>
              </View>
            </ViewShot>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.storyBtn}
              onPress={handleShareStory}
              disabled={sharingImage}
            >
              <LinearGradient
                colors={['#8b5cf6', '#d946ef', '#f43f5e']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.storyBtnGradient}
              >
                {sharingImage ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-whatsapp" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Ionicons name="logo-instagram" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.storyBtnText}>Share Story Card</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.linkBtn}
              onPress={handleShareText}
            >
              <Ionicons name="share-social-outline" size={16} color={MOON.primarySoft} style={{ marginRight: 6 }} />
              <Text style={styles.linkBtnText}>Share Song Link / Text</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

export default ShareStoryModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 3, 10, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#160f2e',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    padding: 18,
    alignItems: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 25,
    elevation: 20,
  },
  topHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrapper: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  storyCard: {
    width: CARD_WIDTH,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(192, 132, 252, 0.35)',
    padding: 18,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: '#100b26',
  },
  cardBrandRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  brandName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.5,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244, 63, 94, 0.18)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#f43f5e',
  },
  liveText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#fecdd3',
    letterSpacing: 0.5,
  },
  artContainer: {
    marginVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
  },
  songInfo: {
    width: '100%',
    marginTop: 12,
    alignItems: 'center',
  },
  songTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 3,
  },
  songArtist: {
    fontSize: 12,
    color: MOON.primarySoft,
    textAlign: 'center',
    fontWeight: '500',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    marginTop: 10,
    marginBottom: 6,
  },
  waveBar: {
    width: 3.5,
    borderRadius: 2,
  },
  cardFooter: {
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  footerTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 0.3,
  },
  actions: {
    width: '100%',
    marginTop: 16,
    gap: 8,
  },
  storyBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  storyBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  storyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: MOON.primarySoft,
  },
});
