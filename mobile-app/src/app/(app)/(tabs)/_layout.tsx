import React from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/auth';
import { useT } from '@/context/settings';
import { FONT } from '@/components/ui/text';
import { useTheme } from '@/theme';

const icon = (name: keyof typeof Feather.glyphMap) =>
  function TabIcon({ color, size }: { color: any; size: number }) {
    return <Feather name={name} size={size} color={color} />;
  };

export default function TabsLayout() {
  const { user } = useAuth();
  const t = useT();
  const theme = useTheme();
  const manager = user?.role === 'OWNER' || user?.role === 'ADMIN';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textFaint,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarLabelStyle: { fontFamily: FONT.semibold, fontSize: 11 },
        lazy: true,
      }}
    >
      <Tabs.Protected guard={manager}>
        <Tabs.Screen name="index" options={{ title: t('Dashboard'), tabBarIcon: icon('grid') }} />
      </Tabs.Protected>
      <Tabs.Screen name="collect" options={{ title: t('Collect'), tabBarIcon: icon('check-square') }} />
      <Tabs.Protected guard={manager}>
        <Tabs.Screen name="entries" options={{ title: t('Entries'), tabBarIcon: icon('list') }} />
      </Tabs.Protected>
      <Tabs.Screen name="reports" options={{ title: t('Reports'), tabBarIcon: icon('bar-chart-2') }} />
      <Tabs.Screen name="more" options={{ title: t('More'), tabBarIcon: icon('menu') }} />
    </Tabs>
  );
}
