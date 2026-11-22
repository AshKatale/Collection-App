import React, { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import * as Updates from 'expo-updates';
import { AppText, Button, Icon, Sheet } from '@/components/ui';
import { useT } from '@/context/settings';
import { errorMessage, formatDateTime } from '@/lib/format';

/** Over-the-air updates only exist in an installed (release) build; Expo Go / dev builds have them switched off. */
export const updatesSupported = !__DEV__ && Updates.isEnabled;

const CHECK_EVERY_MS = 30 * 60 * 1000;

let reopen: (() => void) | null = null;
/** Show the update window again (used by Settings -> Check for updates after the user said "Later"). */
export const reopenUpdatePrompt = () => reopen?.();

/**
 * Pops up when a new version of the app has been published. "Update now" downloads it and restarts the app
 * on the new version. Nothing is lost: collections, the offline queue and the login live on the phone and
 * survive the restart. Checks on start, whenever the app comes to the foreground, and every 30 minutes.
 */
export function UpdatePrompt() {
  const t = useT();
  const { isUpdateAvailable, isUpdatePending, availableUpdate } = Updates.useUpdates();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reopen = () => setDismissedFor(null);
    return () => {
      reopen = null;
    };
  }, []);

  useEffect(() => {
    if (!updatesSupported) return;
    const check = () => {
      Updates.checkForUpdateAsync().catch(() => undefined); // offline / server hiccup: try again next time
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  // An update that was already downloaded in the background has no "available" info: key it as 'pending'
  const key = availableUpdate?.updateId ?? (isUpdatePending ? 'pending' : null);
  const visible = updatesSupported && (isUpdateAvailable || isUpdatePending) && key !== dismissedFor;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!isUpdatePending) await Updates.fetchUpdateAsync();
      await Updates.reloadAsync(); // restarts the app on the new version
    } catch (e) {
      setError(errorMessage(e, t('Update failed. Check your internet connection and try again.')));
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={() => !busy && setDismissedFor(key)} title={t('Update available')}>
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 4 }}>
        <Icon name="download-cloud" size={44} color="primary" />
        <AppText weight="bold" size={16} align="center">
          {t('A new version of the app is ready')}
        </AppText>
        <AppText size={13} color="textMuted" align="center">
          {t('Tap Update now. The app will restart in a few seconds. Your saved collections stay on this phone.')}
        </AppText>
        {availableUpdate?.createdAt ? (
          <AppText size={11} color="textFaint">
            {formatDateTime(availableUpdate.createdAt.getTime())}
          </AppText>
        ) : null}
      </View>
      {error ? (
        <AppText size={12} color="danger" align="center">
          {error}
        </AppText>
      ) : null}
      <Button title={busy ? t('Updating…') : t('Update now')} icon="download" onPress={apply} loading={busy} />
      <Button title={t('Later')} variant="secondary" onPress={() => setDismissedFor(key)} disabled={busy} />
    </Sheet>
  );
}
