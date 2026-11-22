import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, Field, Icon } from '@/components/ui';
import { useAuth } from '@/context/auth';
import { useSettings, useT } from '@/context/settings';
import { errorMessage } from '@/lib/format';
import { ORG_NAME } from '@/lib/config';
import { useTheme } from '@/theme';

export default function Login() {
  const { login } = useAuth();
  const { settings, update } = useSettings();
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) return setError(t('Enter your email and password'));
    setBusy(true);
    setError('');
    try {
      const u = await login(email, password);
      // land on the right home screen for this role (collectors start on Collect)
      setTimeout(() => router.replace(u.role === 'COLLECTOR' ? '/collect' : '/'), 400);
    } catch (err: any) {
      setError(err?.response ? errorMessage(err, t('Login failed')) : t('Cannot reach the server. Login needs an internet connection.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="dollar-sign" size={36} color="#fff" />
          </View>
          <AppText size={22} weight="bold" align="center">
            {ORG_NAME}
          </AppText>
          <AppText color="textMuted" align="center">
            {t('Daily Collection')}
          </AppText>
        </View>

        <Field label={t('Email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" placeholder="name@example.com" />
        <Field
          label={t('Password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!show}
          autoCapitalize="none"
          textContentType="password"
          onSubmitEditing={submit}
          right={
            <Pressable onPress={() => setShow((s) => !s)} hitSlop={10} style={{ padding: 6 }}>
              <Icon name={show ? 'eye-off' : 'eye'} size={20} color="textMuted" />
            </Pressable>
          }
        />
        {error ? (
          <AppText size={13} color="danger">
            {error}
          </AppText>
        ) : null}
        <Button title={t('Sign in')} onPress={submit} loading={busy} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 8 }}>
          <Pressable onPress={() => update({ lang: settings.lang === 'en' ? 'mr' : 'en' })}>
            <AppText color="primary" weight="semibold" size={13}>
              {settings.lang === 'en' ? 'मराठी' : 'English'}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
