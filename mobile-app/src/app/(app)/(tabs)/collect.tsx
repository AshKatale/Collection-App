import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { AppText, Banner, Button, Card, Empty, Field, useDebounced, Icon, Loading, ScreenHeader, Segmented, Sheet, Badge, confirm, toast } from '@/components/ui';
import { DateStepper } from '@/components/date-field';
import { SyncPill } from '@/components/sync-pill';
import { RequestAccessSheet } from '@/components/request-access';
import { CustomerFormSheet } from '@/components/customer-form';
import { useAuth } from '@/context/auth';
import { useT } from '@/context/settings';
import { useLocal } from '@/hooks/data';
import { editAmount, entriesForDate, getGrants, listCustomers, LocalCustomer, LocalEntry, removeEntry, saveCollection } from '@/db/repo';
import { getMeta } from '@/db';
import { formatDate, formatMoney, isMonday } from '@/lib/format';
import { todayISO } from '@/lib/today';
import { TYPES, TYPE_LABELS, TYPE_SHORT, typeColors, usualOf } from '@/lib/types';
import { localDataChanged, syncNow, useSync } from '@/sync/engine';
import { radius, useTheme } from '@/theme';
import type { EntryType } from '@/api/endpoints';

type Slot = { SAVINGS: number; LOAN: number; INTEREST: number; rows: LocalEntry[]; pending: boolean; failed: boolean };
const totalOf = (s?: Slot) => (s ? s.SAVINGS + s.LOAN + s.INTEREST : 0);

export default function Collect() {
  const { user } = useAuth();
  const t = useT();
  const theme = useTheme();
  const { online, version } = useSync();
  const isCollector = user?.role === 'COLLECTOR';
  const today = todayISO();

  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 150);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [active, setActive] = useState<LocalCustomer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [myRequests, setMyRequests] = useState<{ fromDate: string; toDate: string }[]>([]);

  const customers = useLocal(listCustomers, [], [] as LocalCustomer[]);
  const entries = useLocal(() => entriesForDate(date), [date], [] as LocalEntry[]);
  const grants = useLocal(getGrants, [], [] as { fromDate: string; toDate: string }[]);

  useEffect(() => {
    getMeta<any[]>('requests', []).then((r) => setMyRequests(r || []));
  }, [version]);

  // Collectors write today's date or a date the owner approved; owners/admins any date.
  const canWrite = !isCollector || date === today || grants.data.some((g) => g.fromDate <= date && g.toDate >= date);

  const perCustomer = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const e of entries.data) {
      let s = map.get(e.customerId);
      if (!s) map.set(e.customerId, (s = { SAVINGS: 0, LOAN: 0, INTEREST: 0, rows: [], pending: false, failed: false }));
      s[e.type] += e.amount;
      s.rows.push(e);
      if (e.syncState === 'pending') s.pending = true;
      if (e.syncState === 'failed') s.failed = true;
    }
    return map;
  }, [entries.data]);

  const dayTotal = useMemo(() => [...perCustomer.values()].reduce((sum, s) => sum + totalOf(s), 0), [perCustomer]);
  const doneCount = useMemo(() => customers.data.filter((c) => totalOf(perCustomer.get(c.id)) > 0).length, [customers.data, perCustomer]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers.data.filter((c) => {
      const done = totalOf(perCustomer.get(c.id)) > 0;
      if (filter === 'pending' && done) return false;
      if (filter === 'done' && !done) return false;
      return !needle || String(c.accountNo).toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle);
    });
  }, [customers.data, perCustomer, q, filter]);

  const openCustomer = useCallback((c: LocalCustomer) => setActive(c), []);

  const save = async (customer: LocalCustomer, amounts: Partial<Record<EntryType, number>>) => {
    if (!user) return false;
    try {
      const out = await saveCollection({ date, customer, amounts, user });
      if (!out.count) return false;
      await localDataChanged();
      toast.success(online ? t('Saved {amount} for {name}', { amount: formatMoney(out.total), name: customer.name }) : t('Saved on this phone. It will sync when you are online.'));
      return true;
    } catch {
      toast.error(t('Could not save. Please try again.'));
      return false;
    }
  };

  const change = async (entry: LocalEntry, amount: number) => {
    try {
      await editAmount(entry, amount);
      await localDataChanged();
      toast.success(t('Amount updated'));
      return true;
    } catch {
      toast.error(t('Could not update. Please try again.'));
      return false;
    }
  };

  const remove = async (entry: LocalEntry) => {
    const ok = await confirm({
      title: t('Delete this entry?'),
      message: `${t(TYPE_LABELS[entry.type])} ${formatMoney(entry.amount)}`,
      confirmLabel: t('Delete'),
      cancelLabel: t('Cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeEntry(entry);
      await localDataChanged();
      toast.success(t('Entry deleted'));
    } catch {
      toast.error(t('Could not delete. Please try again.'));
    }
  };

  const activeSlot = active ? perCustomer.get(active.id) : undefined;

  const header = (
    <View style={{ gap: 10, padding: 14, paddingBottom: 6 }}>
      <Card style={{ gap: 10 }}>
        <DateStepper value={date} onChange={setDate} />
        {!canWrite ? (
          <View style={{ backgroundColor: theme.warnSoft, borderRadius: radius.lg, padding: 10, gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Icon name="lock" size={16} color="warnText" />
              <AppText size={13} color="warnText" style={{ flex: 1 }}>
                {t('View only. You can only add or change today’s entries unless your owner gives you permission for this date.')}
              </AppText>
            </View>
            {myRequests.some((r) => r.fromDate <= date && r.toDate >= date) ? (
              <AppText size={13} weight="bold" color="warnText">
                {t('Permission requested. Waiting for your owner.')}
              </AppText>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable onPress={() => (online ? setRequestOpen(true) : toast.error(t('This needs an internet connection')))}>
                <AppText size={13} weight="bold" color="warnText" style={{ textDecorationLine: 'underline' }}>
                  {t('Ask owner for permission')}
                </AppText>
              </Pressable>
              <Pressable onPress={() => setDate(today)}>
                <AppText size={13} weight="bold" color="warnText" style={{ textDecorationLine: 'underline' }}>
                  {t('Go to today')}
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.2, backgroundColor: theme.primarySoft, borderRadius: radius.lg, padding: 10 }}>
            <AppText size={11} weight="bold" color="primarySoftText">
              {t('{date} total', { date: formatDate(date) }).toUpperCase()}
            </AppText>
            <AppText size={22} weight="bold" color="primarySoftText" tabular>
              {formatMoney(dayTotal)}
            </AppText>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.cardAlt, borderRadius: radius.lg, padding: 10 }}>
            <AppText size={11} weight="bold" color="textMuted">
              {t('COLLECTED').toUpperCase()}
            </AppText>
            <AppText size={22} weight="bold" tabular>
              {doneCount}
              <AppText size={14} color="textMuted"> / {customers.data.length}</AppText>
            </AppText>
          </View>
        </View>
      </Card>
      <Field value={search} onChangeText={setSearch} placeholder={t('Search name or account no.')} autoCorrect={false} returnKeyType="search" />
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'all', label: `${t('All')} (${customers.data.length})` },
          { key: 'pending', label: `${t('Pending')} (${customers.data.length - doneCount})` },
          { key: 'done', label: `${t('Collected')} (${doneCount})` },
        ]}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader
        title={t('Collect')}
        subtitle={`${user?.name ?? ''} · ${t('{n} customers', { n: customers.data.length })}`}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SyncPill />
            <Pressable
              onPress={() => setAddOpen(true)}
              hitSlop={8}
              accessibilityLabel="Add customer"
              style={{ padding: 6 }}
            >
              <Icon name="user-plus" size={22} color="#fff" />
            </Pressable>
          </View>
        }
      />
      {!online ? <Banner kind="warn">{t('Offline: collections are saved on this phone and sync automatically later.')}</Banner> : null}

      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
        initialNumToRender={14}
        windowSize={9}
        removeClippedSubviews
        onRefresh={() => syncNow()}
        refreshing={false}
        ListEmptyComponent={
          customers.loading ? (
            <Loading rows={6} />
          ) : customers.data.length === 0 ? (
            <Empty
              icon="users"
              title={t('No customers are assigned to you yet.')}
              text={t('You can only collect from customers assigned to you. Ask your owner to assign some, or register one yourself.')}
              action={online ? <Button title={t('Add customer')} icon="user-plus" onPress={() => setAddOpen(true)} /> : <AppText size={12} color="textMuted">{t('Connect to the internet to sync your customers.')}</AppText>}
            />
          ) : (
            <Empty icon="search" title={t('No customers match.')} />
          )
        }
        renderItem={({ item, index }) => (
          <View style={{ marginHorizontal: 14, borderTopLeftRadius: index === 0 ? radius.xl : 0, borderTopRightRadius: index === 0 ? radius.xl : 0, overflow: 'hidden' }}>
            <CustomerRow customer={item} slot={perCustomer.get(item.id)} date={date} canWrite={canWrite} onPress={openCustomer} />
          </View>
        )}
      />

      {active ? (
        <CustomerSheet
          key={active.id}
          customer={active}
          date={date}
          canWrite={canWrite}
          rows={activeSlot?.rows ?? []}
          onClose={() => setActive(null)}
          onSave={save}
          onChangeAmount={change}
          onRemove={remove}
        />
      ) : null}

      <RequestAccessSheet visible={requestOpen} initialDate={date} onClose={() => setRequestOpen(false)} onSent={() => syncNow({ quiet: true })} />
      <CustomerFormSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={async (c) => {
          setAddOpen(false);
          toast.success(t('Customer "{name}" added', { name: c.name }));
          await syncNow({ quiet: true }); // pulls the new customer into the local list
          const fresh = (await listCustomers()).find((x) => x.id === c.id);
          if (fresh) setActive(fresh);
        }}
      />
    </View>
  );
}

const CustomerRow = memo(function CustomerRow({ customer: c, slot, date, canWrite, onPress }: { customer: LocalCustomer; slot?: Slot; date: string; canWrite: boolean; onPress: (c: LocalCustomer) => void }) {
  const theme = useTheme();
  const t = useT();
  const total = totalOf(slot);
  const usual = usualOf(c);
  const usualSum = usual.SAVINGS + usual.LOAN + usual.INTEREST;
  return (
    <Pressable
      onPress={() => onPress(c)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: pressed ? theme.cardAlt : theme.card,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: theme.border,
      })}
    >
      <Icon name={total > 0 ? 'check-circle' : 'circle'} size={24} color={total > 0 ? 'success' : 'textFaint'} />
      <View style={{ flex: 1 }}>
        <AppText weight="semibold" numberOfLines={1}>
          {c.name}
        </AppText>
        <AppText size={12} color="textMuted" numberOfLines={1}>
          #{c.accountNo}
          {usualSum > 0 ? ` · ${t('usual')} ${formatMoney(usualSum * (isMonday(date) ? 2 : 1))}` : ''}
        </AppText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {total > 0 ? (
          <>
            <AppText weight="bold" tabular>
              {formatMoney(total)}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {slot?.failed ? <Icon name="alert-circle" size={12} color="danger" /> : slot?.pending ? <Icon name="cloud-off" size={12} color="warn" /> : null}
              <AppText size={11} color="textMuted">
                {TYPES.filter((x) => slot![x] > 0).map((x) => TYPE_SHORT[x]).join(' · ')}
              </AppText>
            </View>
          </>
        ) : (
          <AppText size={12} weight="semibold" color="primary">
            {canWrite ? t('Collect') : '—'}
          </AppText>
        )}
      </View>
    </Pressable>
  );
});

/** Bottom sheet for one customer: what was collected + add more. */
function CustomerSheet({
  customer,
  date,
  canWrite,
  rows,
  onClose,
  onSave,
  onChangeAmount,
  onRemove,
}: {
  customer: LocalCustomer;
  date: string;
  canWrite: boolean;
  rows: LocalEntry[];
  onClose: () => void;
  onSave: (c: LocalCustomer, a: Partial<Record<EntryType, number>>) => Promise<boolean>;
  onChangeAmount: (e: LocalEntry, amount: number) => Promise<boolean>;
  onRemove: (e: LocalEntry) => Promise<void>;
}) {
  const theme = useTheme();
  const t = useT();
  const factor = isMonday(date) ? 2 : 1;
  const usual = usualOf(customer);

  // Pre-fill with the usual amounts (x2 on Monday). Not when something is already recorded,
  // so a second save can't double-count.
  const [amounts, setAmounts] = useState<Record<EntryType, string>>(() => {
    const init = { SAVINGS: '', LOAN: '', INTEREST: '' } as Record<EntryType, string>;
    if (rows.length === 0) TYPES.forEach((x) => usual[x] > 0 && (init[x] = String(Math.round(usual[x] * factor * 100) / 100)));
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const hasAny = TYPES.some((x) => Number(amounts[x]) > 0);

  const editable = () => canWrite;

  return (
    <Sheet visible onClose={onClose} title={`${customer.accountNo} · ${customer.name}`}>
      <AppText size={12} color="textMuted" style={{ marginTop: -6 }}>
        {formatDate(date)}
      </AppText>

      {rows.length > 0 ? (
        <View style={{ gap: 6 }}>
          <AppText size={12} weight="bold" color="textMuted">
            {t('ALREADY RECORDED')}
          </AppText>
          <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg, overflow: 'hidden' }}>
            {rows.map((en, i) => {
              const col = typeColors(theme, en.type);
              return (
                <View key={en.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 10, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
                  <View style={{ gap: 2 }}>
                    <Badge text={t(TYPE_LABELS[en.type])} bg={col.bg} fg={col.fg} />
                    {en.syncState !== 'synced' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Icon name={en.syncState === 'failed' ? 'alert-circle' : 'cloud-off'} size={11} color={en.syncState === 'failed' ? 'danger' : 'warn'} />
                        <AppText size={10} color={en.syncState === 'failed' ? 'danger' : 'warn'}>
                          {en.syncState === 'failed' ? t('Sync failed') : t('Waiting to sync')}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  {editingId === en.id ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Field value={editValue} onChangeText={setEditValue} keyboardType="decimal-pad" autoFocus style={{ width: 96, textAlign: 'right', minHeight: 38, paddingVertical: 6 }} />
                      <Pressable
                        hitSlop={8}
                        style={{ padding: 6 }}
                        onPress={async () => {
                          const v = Number(editValue);
                          if (!(v > 0)) return toast.error(t('Enter an amount greater than 0'));
                          if (await onChangeAmount(en, v)) setEditingId(null);
                        }}
                      >
                        <Icon name="check" size={20} color="success" />
                      </Pressable>
                      <Pressable hitSlop={8} style={{ padding: 6 }} onPress={() => setEditingId(null)}>
                        <Icon name="x" size={20} color="textMuted" />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <AppText weight="bold" tabular>
                        {formatMoney(en.amount)}
                      </AppText>
                      {editable() ? (
                        <>
                          <Pressable
                            hitSlop={8}
                            style={{ padding: 8 }}
                            accessibilityLabel="Edit amount"
                            onPress={() => {
                              setEditingId(en.id);
                              setEditValue(String(en.amount));
                            }}
                          >
                            <Icon name="edit-2" size={17} color="textMuted" />
                          </Pressable>
                          <Pressable hitSlop={8} style={{ padding: 8 }} accessibilityLabel="Delete entry" onPress={() => onRemove(en)}>
                            <Icon name="trash-2" size={17} color="danger" />
                          </Pressable>
                        </>
                      ) : (
                        <View style={{ padding: 8 }}>
                          <Icon name="lock" size={16} color="textFaint" />
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {canWrite ? (
        <View style={{ gap: 12 }}>
          <AppText size={12} weight="bold" color="textMuted">
            {(rows.length ? t('Add more') : t('Record collection')).toUpperCase()}
          </AppText>
          {TYPES.map((x) => (
            <View key={x}>
              <Field
                label={`${t(TYPE_LABELS[x])} (₹)`}
                value={amounts[x]}
                onChangeText={(v) => setAmounts((a) => ({ ...a, [x]: v.replace(/[^0-9.]/g, '') }))}
                keyboardType="decimal-pad"
                placeholder="0"
                style={{ fontSize: 20, fontFamily: 'NotoSansDevanagari_700Bold' }}
              />
              {usual[x] > 0 ? (
                <Pressable onPress={() => setAmounts((a) => ({ ...a, [x]: String(Math.round(usual[x] * factor * 100) / 100) }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                  <Icon name="zap" size={14} color="primary" />
                  <AppText size={12} weight="semibold" color="primary">
                    {t('Use usual')} {formatMoney(usual[x] * factor)}
                    {factor === 2 ? ` (${t('Monday ×2')})` : ''}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Button
            title={saving ? t('Saving…') : t('Save collection')}
            disabled={!hasAny}
            loading={saving}
            onPress={async () => {
              if (!hasAny) return toast.error(t('Enter at least one amount'));
              setSaving(true);
              const ok = await onSave(
                customer,
                Object.fromEntries(TYPES.map((x) => [x, Number(amounts[x]) || 0]))
              );
              setSaving(false);
              if (ok) onClose();
            }}
          />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name="lock" size={16} color="textMuted" />
          <AppText size={13} color="textMuted" style={{ flex: 1 }}>
            {t('Entries of other days can’t be changed by collectors.')}
          </AppText>
        </View>
      )}
    </Sheet>
  );
}
