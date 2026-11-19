import React from 'react';
import { Stack } from 'expo-router';
import { ReauthSheet } from '@/components/reauth';

export default function AppLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <ReauthSheet />
    </>
  );
}
