import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
} from '@expo-google-fonts/noto-sans-devanagari';
import { SettingsProvider, useSettings } from '@/context/settings';
import { AuthProvider, useAuth } from '@/context/auth';
import { AppText, Button, Toaster } from '@/components/ui';
import { UpdatePrompt } from '@/components/update-prompt';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Any crash inside a screen lands here instead of a white screen; local data is never touched. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' }}>
      <AppText size={20} weight="bold">
        Something went wrong
      </AppText>
      <AppText color="#6b7280">Your collected data is safe on this phone. Try again.</AppText>
      <AppText size={12} color="#9ca3af">
        {String(error?.message || error)}
      </AppText>
      <Button title="Try again" onPress={retry} />
    </View>
  );
}

function Gate() {
  const { status } = useAuth();
  const { ready, settings } = useSettings();
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_500Medium,
    NotoSansDevanagari_600SemiBold,
    NotoSansDevanagari_700Bold,
  });

  const done = ready && status !== 'loading' && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (done) SplashScreen.hideAsync().catch(() => undefined);
  }, [done]);

  if (!done) return null;
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style="light" key={settings.theme} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      <Toaster />
      <UpdatePrompt />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
