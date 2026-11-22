import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, toast } from '@/components/ui';
import { useT } from '@/context/settings';
import { canSaveToFolder, downloadReport, saveReportToFolder } from '@/lib/export';
import { useSync } from '@/sync/engine';
import { errorMessage } from '@/lib/format';

type Format = 'xlsx' | 'pdf';

/**
 * Excel / PDF export, built on the server (needs a connection).
 * Row 1 opens the share sheet. On Android a second row saves straight into a folder you choose.
 */
export function ExportButtons({ params }: { params: Record<string, string | number | undefined> }) {
  const t = useT();
  const { online } = useSync();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, job: () => Promise<void>) => {
    if (!online) return toast.error(t('Exporting needs an internet connection'));
    setBusy(key);
    try {
      await job();
    } catch (e) {
      toast.error(errorMessage(e, t('Export failed')));
    } finally {
      setBusy(null);
    }
  };

  const share = (f: Format) => run(`share-${f}`, () => downloadReport(params, f));
  const save = (f: Format) =>
    run(`save-${f}`, async () => {
      const saved = await saveReportToFolder(params, f);
      if (saved) toast.success(t('Saved to the folder you selected'));
    });

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button variant="outline" icon="share-2" title="Excel" onPress={() => share('xlsx')} loading={busy === 'share-xlsx'} disabled={!!busy} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="outline" icon="share-2" title="PDF" onPress={() => share('pdf')} loading={busy === 'share-pdf'} disabled={!!busy} />
        </View>
      </View>
      {canSaveToFolder ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button variant="outline" icon="download" title={t('Save Excel')} onPress={() => save('xlsx')} loading={busy === 'save-xlsx'} disabled={!!busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="outline" icon="download" title={t('Save PDF')} onPress={() => save('pdf')} loading={busy === 'save-pdf'} disabled={!!busy} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
