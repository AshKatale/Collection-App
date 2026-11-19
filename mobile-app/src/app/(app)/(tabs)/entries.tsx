import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { AppText, Badge, Banner, Button, Card, Empty, Field, Icon, Loading, ScreenHeader, Segmented, Sheet, confirm, toast } from '@/components/ui';
import { DateField } from '@/components/date-field';
import { Select } from '@/components/select';
import { SyncPill } from '@/components/sync-pill';
import { useT } from '@/context/settings';
import { createEntryApi, deleteEntryApi, getCollectors, getCustomers, getEntriesApi, updateEntryApi } from '@/api/endpoints';
import { useApi } from '@/hooks/data';
import { errorMessage, formatDate, formatMoney, isNetworkError } from '@/lib/format';
import { todayISO } from '@/lib/today';
import { uuid } from '@/lib/id';
import { TYPES, TYPE_LABELS, typeColors } from '@/lib/types';
import { cacheRead, cacheWrite } from '@/db';
import { syncNow, useSync } from '@/sync/engine';
import { useTheme } from '@/theme';

const PAGE = 30;
const empty = { from: '', to: '', collectorId: '', customerId: '', type: '' };

export default function Entries() {
  const t = useT();
  const theme = useTheme();
  const { online } = useSync();
  const [filters, setFilters] = useState(empty);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);

  const customers = useApi('customers_all', getCustomers);
  const collectors = useApi('collectors_list', getCollectors);

  const load = useCallback(
    async (p: number, replace: boolean) => {
      setLoading(true);
      const params: Record<string, any> = { page: p, limit: PAGE };
      Object.entries(filters).forEach(([k, v]) => v && (params[k] = v));
      const key = `entries_${JSON.stringify(params)}`;
      try {
        const res = await getEntriesApi(params);
        setRows((prev) => (replace ? res.data : [...prev, ...res.data]));
        setTotal(res.total);
        setTotalAmount(res.totalAmount);
        setPage(p);
        setCached(false);
        if (p === 1) void cacheWrite(key, res);
      } catch (e) {
        if (isNetworkError(e) && p === 1) {
          const c = await cacheRead<any>(key);
          if (c) {
            setRows(c.data.data);
            setTotal(c.data.total);
            setTotalAmount(c.data.totalAmount);
            setCached(true);
          }
        } else toast.error(errorMessage(e, t('Failed to load entries')));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters]
  );

  useEffect(() => {
    void load(1, true);
  }, [load, online]);

  const hasFilters = Object.values(filters).some(Boolean);
  const set = (k: keyof typeof empty) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const remove = async (e: any) => {
    if (!online) return toast.error(t('This needs an internet connection'));
    if (!(await confirm({ title: t('Delete this entry?'), message: `${e.customer?.name} · ${formatMoney(e.amount)}`, confirmLabel: t('Delete'), cancelLabel: t('Cancel'), destructive: true }))) return;
    try {
      await deleteEntryApi(e.id);
      toast.success(t('Entry deleted'));
      await load(1, true);
      void syncNow({ quiet: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader
        title={t('Entries')}
        subtitle={`${total} · ${formatMoney(totalAmount)}`}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SyncPill />
            <Pressable onPress={() => setShowFilters(true)} hitSlop={8}>
              <Icon name="filter" size={21} color="#fff" />
            </Pressable>
            <Pressable onPress={() => (online ? setAdding(true) : toast.error(t('This needs an internet connection')))} hitSlop={8}>
              <Icon name="plus-circle" size={23} color="#fff" />
            </Pressable>
          </View>
        }
      />
      {cached ? <Banner>{t('Offline: showing the last saved list')}</Banner> : null}
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 40 }}
        refreshing={false}
        onRefresh={() => load(1, true)}
        onEndReachedThreshold={0.4}
        onEndReached={() => !loading && rows.length < total && load(page + 1, false)}
        ListHeaderComponent={hasFilters ? <Button small variant="outline" icon="x" title={t('Clear filters')} onPress={() => setFilters(empty)} /> : undefined}
        ListEmptyComponent={loading ? <Loading rows={5} /> : <Empty icon="inbox" title={t('No entries match these filters.')} />}
        ListFooterComponent={loading && rows.length ? <Loading /> : undefined}
        renderItem={({ item: e }) => {
          const col = typeColors(theme, e.type);
          return (
            <Card onPress={() => setEditing(e)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText weight="semibold" numberOfLines={1}>
                  {e.customer?.name} <AppText size={12} color="textMuted">#{e.customer?.accountNo}</AppText>
                </AppText>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Badge text={t(TYPE_LABELS[e.type as keyof typeof TYPE_LABELS])} bg={col.bg} fg={col.fg} />
                  <AppText size={11} color="textMuted">
                    {formatDate(e.date)} · {e.collector?.name}
                  </AppText>
                </View>
              </View>
              <AppText weight="bold" tabular>
                {formatMoney(e.amount)}
              </AppText>
            </Card>
          );
        }}
      />

      <Sheet visible={showFilters} onClose={() => setShowFilters(false)} title={t('Filters')}>
        <DateField label={t('From date')} value={filters.from || todayISO()} onChange={set('from')} />
        <DateField label={t('To date')} value={filters.to || todayISO()} onChange={set('to')} />
        <Select label={t('Collector')} value={filters.collectorId} onChange={set('collectorId')} options={[{ value: '', label: t('All') }, ...(collectors.data ?? []).map((c: any) => ({ value: c.id, label: c.name }))]} />
        <Select searchable label={t('Customer')} value={filters.customerId} onChange={set('customerId')} options={[{ value: '', label: t('All') }, ...(customers.data ?? []).map((c: any) => ({ value: c.id, label: `#${c.accountNo} · ${c.name}` }))]} />
        <Select label={t('Type')} value={filters.type} onChange={set('type')} options={[{ value: '', label: t('All') }, ...TYPES.map((x) => ({ value: x, label: t(TYPE_LABELS[x]) }))]} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title={t('Clear')} onPress={() => (setFilters(empty), setShowFilters(false))} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t('Apply')} onPress={() => setShowFilters(false)} />
          </View>
        </View>
      </Sheet>

      <EditEntry entry={editing} onClose={() => setEditing(null)} onDelete={remove} onSaved={() => (setEditing(null), load(1, true), syncNow({ quiet: true }))} />
      <AddEntry
        visible={adding}
        customers={customers.data ?? []}
        collectors={collectors.data ?? []}
        onClose={() => setAdding(false)}
        onSaved={() => (setAdding(false), load(1, true), syncNow({ quiet: true }))}
      />
    </View>
  );
}

function EditEntry({ entry, onClose, onSaved, onDelete }: { entry: any | null; onClose: () => void; onSaved: () => void; onDelete: (e: any) => void }) {
  const t = useT();
  const { online } = useSync();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('SAVINGS');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (entry) {
      setAmount(String(entry.amount));
      setType(entry.type);
      setNotes(entry.notes ?? '');
    }
  }, [entry]);
  if (!entry) return null;
  return (
    <Sheet visible onClose={onClose} title={`${entry.customer?.name} · ${formatDate(entry.date)}`}>
      <Segmented value={type} onChange={setType} options={TYPES.map((x) => ({ key: x, label: t(TYPE_LABELS[x]) }))} />
      <Field label={t('Amount (₹)')} value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={{ fontSize: 20 }} />
      <Field label={t('Notes')} value={notes} onChangeText={setNotes} />
      <Button
        title={t('Save changes')}
        loading={busy}
        onPress={async () => {
          if (!online) return toast.error(t('This needs an internet connection'));
          if (!(Number(amount) > 0)) return toast.error(t('Enter an amount greater than 0'));
          setBusy(true);
          try {
            await updateEntryApi(entry.id, { amount: Number(amount), type, notes });
            toast.success(t('Entry updated'));
            onSaved();
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button variant="danger" icon="trash-2" title={t('Delete entry')} onPress={() => (onClose(), onDelete(entry))} />
    </Sheet>
  );
}

function AddEntry({ visible, customers, collectors, onClose, onSaved }: { visible: boolean; customers: any[]; collectors: any[]; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const { online } = useSync();
  const [f, setF] = useState({ date: todayISO(), customerId: '', collectorId: '', type: 'SAVINGS', amount: '', notes: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) setF({ date: todayISO(), customerId: '', collectorId: '', type: 'SAVINGS', amount: '', notes: '' });
  }, [visible]);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Sheet visible={visible} onClose={onClose} title={t('Add entry')}>
      <DateField label={t('Date')} value={f.date} onChange={set('date')} />
      <Select searchable label={t('Customer')} value={f.customerId} onChange={set('customerId')} options={customers.map((c) => ({ value: c.id, label: `#${c.accountNo} · ${c.name}` }))} />
      <Select label={t('Collector')} value={f.collectorId} onChange={set('collectorId')} options={[{ value: '', label: t('Myself') }, ...collectors.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))]} />
      <Segmented value={f.type} onChange={set('type')} options={TYPES.map((x) => ({ key: x, label: t(TYPE_LABELS[x]) }))} />
      <Field label={t('Amount (₹)')} value={f.amount} onChangeText={(v) => set('amount')(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={{ fontSize: 20 }} />
      <Field label={t('Notes')} value={f.notes} onChangeText={set('notes')} />
      <Button
        title={t('Add entry')}
        loading={busy}
        onPress={async () => {
          if (!online) return toast.error(t('This needs an internet connection'));
          if (!f.customerId) return toast.error(t('Select a customer'));
          if (!(Number(f.amount) > 0)) return toast.error(t('Enter an amount greater than 0'));
          setBusy(true);
          try {
            await createEntryApi({ date: f.date, customerId: f.customerId, collectorId: f.collectorId || undefined, type: f.type, amount: Number(f.amount), notes: f.notes || undefined, clientId: uuid() });
            toast.success(t('Entry added'));
            onSaved();
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Sheet>
  );
}
