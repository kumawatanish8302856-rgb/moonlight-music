import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { memo, useEffect } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const MOON = {
  bar: '#150f2b',
  border: 'rgba(167,139,250,0.25)',
  textDim: '#a89fc7',
};

const TABS = [
  { key: 'home', label: 'Home', icon: 'home', iconOff: 'home-outline', path: '/home' },
  { key: 'search', label: 'Search', icon: 'search', iconOff: 'search-outline', path: '/search' },
  { key: 'profile', label: 'My Profile', icon: 'person-circle', iconOff: 'person-circle-outline', path: '/profile' },
] as const;

const BottomNav = memo(function BottomNav({ active }: { active: 'home' | 'search' | 'profile' }) {
  const router = useRouter();

  // Pressing Android back from Search or Profile routes back to Home
  useEffect(() => {
    if (active === 'home') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/home');
      return true;
    });
    return () => sub.remove();
  }, [active, router]);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              activeOpacity={0.85}
              onPress={() => {
                if (!isActive) router.replace(t.path);
              }}
              style={styles.tabTouch}
            >
              {isActive ? (
                <LinearGradient
                  colors={['#8b5cf6', '#c026d3']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.tabActive}
                >
                  <Ionicons name={t.icon} size={20} color="#fff" />
                  <Text style={styles.tabLabel}>{t.label}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.tabInactive}>
                  <Ionicons name={t.iconOff} size={22} color={MOON.textDim} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

export default BottomNav;

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 4,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: MOON.bar,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: MOON.border,
    padding: 6,
    elevation: 12,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  tabTouch: { flex: 1, alignItems: 'center' },
  tabActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    height: 46,
    borderRadius: 24,
  },
  tabLabel: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  tabInactive: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
