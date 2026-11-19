import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, toast } from '@/components/ui';
import { useT } from '@/context/settings';
import { downloadReport } from '@/lib/export';
import { useSync } from '@/sync/engine';
import { errorMessage } from '@/lib/format';

/** Excel / PDF export: built on the server, shared through the phone's share sheet (needs a connection). */
export function ExportButtons({ params }: { params: Record<string, string | number | undefined> }) {
  const t = useT();
  const { online } = useSync();
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);

  const go = async (format: 'xlsx' | 'pdf') => {
    if (!online) return toast.error(t('Exporting needs an internet connection'));
    setBusy(format);
    try {
      await downloadReport(params, format);
    } catch (e) {
      toast.error(errorMessage(e, t('Export failed')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Button variant="outline" icon="file-text" title="Excel" onPress={() => go('xlsx')} loading={busy === 'xlsx'} disabled={!!busy} />
      </View>
      <View style={{ flex: 1 }}>
        <Button variant="outline" icon="file" title="PDF" onPress={() => go('pdf')} loading={busy === 'pdf'} disabled={!!busy} />
      </View>
    </View>
  );
}
