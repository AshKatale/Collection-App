import React, { useEffect, useState } from 'react';
import { AppText, Button, Field, Sheet, toast } from '@/components/ui';
import { useAuth } from '@/context/auth';
import { useT } from '@/context/settings';
import { errorMessage } from '@/lib/format';
import { useSync } from '@/sync/engine';

let openFn: (() => void) | null = null;
export const openReauth = () => openFn?.();

/** Shown when the server no longer accepts the token. All offline data stays; only the password is needed. */
export function ReauthSheet() {
  const { user, reauth } = useAuth();
  const t = useT();
  const { sessionExpired } = useSync();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    openFn = () => setOpen(true);
    return () => {
      openFn = null;
    };
  }, []);
  useEffect(() => {
    if (!sessionExpired) setOpen(false);
  }, [sessionExpired]);

  return (
    <Sheet visible={open} onClose={() => setOpen(false)} title={t('Session expired')}>
      <AppText size={13} color="textMuted">
        {t('Sign in again to continue syncing. Everything you collected on this phone is safe.')}
      </AppText>
      <AppText weight="semibold">{user?.email}</AppText>
      <Field label={t('Password')} value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" />
      <Button
        title={t('Sign in')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await reauth(pw);
            setPw('');
            setOpen(false);
            toast.success(t('Signed in'));
          } catch (e: any) {
            toast.error(e?.response ? errorMessage(e) : e?.message || t('Cannot reach the server'));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Sheet>
  );
}
