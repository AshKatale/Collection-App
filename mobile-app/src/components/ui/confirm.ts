import { Alert, Platform } from 'react-native';

/** Promise-based native confirm dialog. */
export function confirm(opts: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean }): Promise<boolean> {
  if (Platform.OS === 'web') {
    // Alert.alert is a no-op in browsers
    return Promise.resolve(typeof window !== 'undefined' && window.confirm([opts.title, opts.message].filter(Boolean).join('\n\n')));
  }
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: opts.confirmLabel ?? 'OK', style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
