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

function parseFlexibleDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Match DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY
  const match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(trimmed);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    year >= 1900 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= new Date()
  ) {
    const dd = day < 10 ? `0${day}` : `${day}`;
    const mm = month < 10 ? `0${month}` : `${month}`;
    return `${dd}/${mm}/${year}`;
  }
  return null;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (isGuest = false) => {
    if (isGuest) {
      setSaving(true);
      setError('');
      try {
        await saveUserProfile({
          name: 'Midnight Listener',
          dateOfBirth: '',
          phone: '',
        });
        router.replace('/home');
      } catch {
        router.replace('/home');
      } finally {
        setSaving(false);
      }
      return;
    }

    const cleanName = name.trim();
    const cleanDateOfBirth = dateOfBirth.trim();
    const cleanPhone = phone.trim();

    if (!cleanName) {
      setError('Please enter your name or tap "Skip for now".');
      return;
    }

    let formattedDob = '';
    if (cleanDateOfBirth) {
      const parsed = parseFlexibleDate(cleanDateOfBirth);
      if (!parsed) {
        setError('Please enter a valid date of birth (DD/MM/YYYY).');
        return;
      }
      formattedDob = parsed;
    }

    let formattedPhone = '';
    if (cleanPhone) {
      const digits = cleanPhone.replace(/\D/g, '');
      if (!/^[+\d()\s-]+$/.test(cleanPhone) || digits.length < 10 || digits.length > 15) {
        setError('Please enter a valid 10-15 digit phone number or leave it blank.');
        return;
      }
      formattedPhone = cleanPhone;
    }

    setSaving(true);
    setError('');
    try {
      await saveUserProfile({
        name: cleanName,
        dateOfBirth: formattedDob,
        phone: formattedPhone,
      });
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
            <Text style={styles.title}>Welcome</Text>
            <Text style={styles.subtitle}>Music for the midnight mood</Text>

            <View style={styles.form}>
              <View>
                <Text style={styles.inputLabel}>Your Name *</Text>
                <TextInput
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    if (error) setError('');
                  }}
                  placeholder="e.g. Alex"
                  placeholderTextColor="#7c729c"
                  style={styles.input}
                  autoCapitalize="words"
                  autoComplete="name"
                  returnKeyType="next"
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>Date of birth (optional)</Text>
                <TextInput
                  value={dateOfBirth}
                  onChangeText={(t) => {
                    setDateOfBirth(t);
                    if (error) setError('');
                  }}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor="#7c729c"
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  returnKeyType="next"
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>Phone number (optional)</Text>
                <TextInput
                  value={phone}
                  onChangeText={(t) => {
                    setPhone(t);
                    if (error) setError('');
                  }}
                  placeholder="+91 or standard phone"
                  placeholderTextColor="#7c729c"
                  style={styles.input}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={() => void submit(false)}
                />
              </View>
            </View>

            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              activeOpacity={0.85}
              onPress={() => void submit(false)}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#08060f" />
              ) : (
                <Text style={styles.buttonText}>Get Started</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              activeOpacity={0.7}
              onPress={() => void submit(true)}
              disabled={saving}
            >
              <Text style={styles.skipButtonText}>Skip for now & explore music</Text>
            </TouchableOpacity>

            <Text style={styles.privacy}>Saved locally on your device only.</Text>
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
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 28,
    alignItems: 'center',
  },
  logo: { width: 88, height: 88, marginBottom: 12 },
  brand: { color: '#a78bfa', fontSize: 13, letterSpacing: 3, fontWeight: '700' },
  title: { color: '#f5f3ff', fontSize: 28, fontWeight: '800', marginTop: 10 },
  subtitle: { color: '#a89fc7', fontSize: 14, marginTop: 6, marginBottom: 24 },
  form: { width: '100%', gap: 14 },
  inputLabel: {
    color: '#a89fc7',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#1a1430',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    color: '#f5f3ff',
    fontSize: 15,
  },
  error: { color: '#fda4af', marginTop: 14, textAlign: 'center', fontSize: 13 },
  button: {
    marginTop: 22,
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#a78bfa',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#08060f', fontSize: 16, fontWeight: '700' },
  skipButton: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  skipButtonText: {
    color: '#c4b5fd',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  privacy: { color: '#7c729c', fontSize: 12, marginTop: 14, textAlign: 'center' },
});
