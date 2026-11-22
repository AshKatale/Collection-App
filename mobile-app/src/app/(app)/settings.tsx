import React, { useState } from 'react';
import { View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { reopenUpdatePrompt, updatesSupported } from '@/components/update-prompt';
import { AppText, Button, Card, Field, Screen, Segmented, toast } from '@/components/ui';
import { useAuth } from '@/context/auth';
import { useSettings } from '@/context/settings';
import { changePasswordApi, getAdminDashboard } from '@/api/endpoints';
import { errorMessage, formatDateTime } from '@/lib/format';
import { useApi } from '@/hooks/data';
import { useSync } from '@/sync/engine';
import { getApiBaseUrl } from '@/api/client';

export default function Settings() {
  const { user } = useAuth();
  const { settings, update, t } = useSettings();
  const { online } = useSync();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const stats = useApi('admin_stats', getAdminDashboard, [], user?.role === 'ADMIN');

  const [checking, setChecking] = useState(false);
  const checkUpdates = async () => {
    if (!updatesSupported) return toast.info(t('Updates work only in the installed app, not in development.'));
    if (!online) return toast.error(t('This needs an internet connection'));
    setChecking(true);
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) reopenUpdatePrompt();
      else toast.success(t('You are on the latest version'));
    } catch (e) {
      toast.error(errorMessage(e, t('Could not check for updates')));
    } finally {
      setChecking(false);
    }
  };

  const changePassword = async () => {
    if (!online) return toast.error(t('This needs an internet connection'));
    if (next !== again) return toast.error(t('New passwords do not match'));
    if (next.length < 6) return toast.error(t('Password must be at least 6 characters'));
    setBusy(true);
    try {
      await changePasswordApi(cur, next);
      toast.success(t('Password changed successfully'));
      setCur('');
      setNext('');
      setAgain('');
    } catch (e) {
      toast.error(errorMessage(e, t('Failed to change password')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('Settings')} back>
      <Card style={{ gap: 12 }}>
        <AppText weight="bold">{t('Language')}</AppText>
        <Segmented value={settings.lang} onChange={(lang) => update({ lang })} options={[{ key: 'en', label: 'English' }, { key: 'mr', label: 'मराठी' }]} />
        <AppText weight="bold" style={{ marginTop: 6 }}>
          {t('Appearance')}
        </AppText>
        <Segmented
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[{ key: 'system', label: t('Auto') }, { key: 'light', label: t('Light') }, { key: 'dark', label: t('Dark') }]}
        />
      </Card>

      {stats.data ? (
        <Card style={{ gap: 8 }}>
          <AppText weight="bold">{t('System overview')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              [t('Users'), stats.data.totalUsers],
              [t('Owners'), stats.data.totalOwners],
              [t('Collectors'), stats.data.totalCollectors],
              [t('Customers'), stats.data.totalCustomers],
            ].map(([l, v]) => (
              <View key={String(l)} style={{ width: '48%', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' }}>
                <AppText size={22} weight="bold" color="primary">
                  {String(v)}
                </AppText>
                <AppText size={11} color="textMuted">
                  {String(l)}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <AppText weight="bold">{t('Change password')}</AppText>
        <Field label={t('Current password')} value={cur} onChangeText={setCur} secureTextEntry autoCapitalize="none" />
        <Field label={t('New password')} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
        <Field label={t('Confirm new password')} value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" />
        <Button title={t('Update password')} onPress={changePassword} loading={busy} disabled={!cur || !next || !again} />
      </Card>

      <Card style={{ gap: 6 }}>
        <AppText weight="bold">{t('Server')}</AppText>
        {/* Read-only: the address is set in .env (EXPO_PUBLIC_API_URL) when the app is built / started */}
        <AppText size={12} color="textMuted" selectable>
          {getApiBaseUrl()}
        </AppText>
      </Card>

      <Card style={{ gap: 10 }}>
        <AppText weight="bold">{t('App update')}</AppText>
        <AppText size={12} color="textMuted">
          {`v${Constants.expoConfig?.version ?? '1.0.0'}`}
          {Updates.updateId ? ` · ${Updates.updateId.slice(0, 8)}` : ''}
          {Updates.createdAt ? ` · ${formatDateTime(Updates.createdAt.getTime())}` : ''}
        </AppText>
        <Button title={checking ? t('Checking…') : t('Check for updates')} variant="outline" icon="refresh-cw" onPress={checkUpdates} loading={checking} />
      </Card>

      <AppText size={12} color="textMuted" align="center">
        {user?.name} · v{Constants.expoConfig?.version ?? '1.0.0'}
      </AppText>
    </Screen>
  );
}
