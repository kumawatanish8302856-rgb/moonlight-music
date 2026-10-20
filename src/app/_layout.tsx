import { Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

const BG = '#08060f';

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: BG },
        }}
      >
        <Stack.Screen name="player" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </View>
  );
}
