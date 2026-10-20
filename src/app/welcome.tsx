import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveUserProfile } from '../lib/userProfile';

const BG = '#08060f';

function isValidDateOfBirth(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return false;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return year >= 1900
    && date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    && date <= new Date();
}

export default function WelcomeScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const cleanName = name.trim();
    const cleanDateOfBirth = dateOfBirth.trim();
    const cleanPhone = phone.trim();
    const digits = cleanPhone.replace(/\D/g, '');

    if (!cleanName) {
      setError('Please enter your name.');
      return;
    }
    if (!isValidDateOfBirth(cleanDateOfBirth)) {
      setError('Date of birth DD/MM/YYYY format me enter karein.');
      return;
    }
    if (!/^[+\d()\s-]+$/.test(cleanPhone) || digits.length < 10 || digits.length > 15) {
      setError('Please enter a valid phone number.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await saveUserProfile({ name: cleanName, dateOfBirth: cleanDateOfBirth, phone: cleanPhone });
      router.replace('/home');
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient colors={['#1b1040', BG, BG]} locations={[0, 0.45, 1]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor="#1b1040" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={require('@/assets/images/moonlight-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.brand}>MOONLIGHT</Text>
            <Text style={styles.title}>Create your profile</Text>
            <Text style={styles.subtitle}>A few details to get started</Text>

            <View style={styles.form}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Name"
                placeholderTextColor="#a89fc7"
                style={styles.input}
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="next"
              />
              <TextInput
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                placeholder="Date of birth (DD/MM/YYYY)"
                placeholderTextColor="#a89fc7"
                style={styles.input}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                returnKeyType="next"
              />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor="#a89fc7"
                style={styles.input}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
              />
            </View>

            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              activeOpacity={0.85}
              onPress={() => void submit()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#08060f" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.privacy}>Saved on this device only; not synced to an account.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  logo: { width: 78, height: 78 },
  brand: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 3, marginTop: 8 },
  title: { color: '#f5f3ff', fontSize: 27, fontWeight: '800', marginTop: 28 },
  subtitle: { color: '#a89fc7', fontSize: 15, marginTop: 8 },
  form: { width: '100%', maxWidth: 420, gap: 13, marginTop: 30 },
  input: {
    color: '#f5f3ff',
    backgroundColor: '#171128',
    borderColor: 'rgba(167,139,250,0.3)',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
  },
  error: { color: '#fda4af', marginTop: 14, textAlign: 'center' },
  button: {
    width: '100%',
    maxWidth: 420,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: '#c4b5fd',
    marginTop: 22,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#08060f', fontSize: 16, fontWeight: '800' },
  privacy: { color: '#a89fc7', fontSize: 12, marginTop: 16 },
});
