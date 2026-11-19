import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { AppText, Banner, Card, Empty, Field, Icon, Loading, ScreenHeader, confirm, toast, useDebounced } from '@/components/ui';
import { CustomerFormSheet } from '@/components/customer-form';
import { useT } from '@/context/settings';
import { deleteCustomerApi, getCollectors, getCustomers, ServerCustomer } from '@/api/endpoints';
import { useApi } from '@/hooks/data';
import { byAccount, errorMessage, formatMoney } from '@/lib/format';
import { syncNow, useSync } from '@/sync/engine';
import { usualOf } from '@/lib/types';
import { useTheme } from '@/theme';

export default function Customers() {
  const t = useT();
  const theme = useTheme();
  const { online } = useSync();
  const api = useApi('customers_all', getCustomers, [online]);
  const collectors = useApi('collectors_list', getCollectors, [online]);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 150);
  const [form, setForm] = useState<{ open: boolean; item: ServerCustomer | null }>({ open: false, item: null });

  const nameOf = useMemo(() => new Map((collectors.data ?? []).map((c: any) => [c.id, c.name])), [collectors.data]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (api.data ?? []).slice().sort(byAccount).filter((c) => !needle || String(c.accountNo).toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle));
  }, [api.data, q]);

  const guard = () => {
    if (online) return true;
    toast.error(t('This needs an internet connection'));
    return false;
  };
  const refresh = async () => {
    await api.reload();
    void syncNow({ quiet: true }); // keep the Collect list on the phone in step
  };

  const remove = async (c: ServerCustomer) => {
    if (!guard()) return;
    if (!(await confirm({ title: t('Delete {name}?', { name: c.name }), message: t('Customers with history are archived, others are removed.'), confirmLabel: t('Delete'), cancelLabel: t('Cancel'), destructive: true }))) return;
    try {
      await deleteCustomerApi(c.id);
      toast.success(t('Customer removed'));
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader
        title={t('Customers')}
        subtitle={`${api.data?.length ?? 0}`}
        back
        right={
          <Pressable onPress={() => (guard() ? setForm({ open: true, item: null }) : undefined)} hitSlop={10}>
            <Icon name="user-plus" size={22} color="#fff" />
          </Pressable>
        }
      />
      {api.fromCache ? <Banner>{t('Offline: showing the last saved list')}</Banner> : null}
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 40 }}
        refreshing={false}
        onRefresh={refresh}
        ListHeaderComponent={<Field value={search} onChangeText={setSearch} placeholder={t('Search name or account no.')} />}
        ListEmptyComponent={api.loading ? <Loading rows={6} /> : api.error ? <Empty icon="wifi-off" title={api.error} /> : <Empty icon="users" title={t('No customers yet')} />}
        renderItem={({ item: c }) => {
          const u = usualOf({ defaultSavings: c.defaultSavings ?? null, defaultLoan: c.defaultLoan ?? null, defaultInterest: c.defaultInterest ?? null, defaultDailyAmount: c.defaultDailyAmount ?? null });
          const sum = u.SAVINGS + u.LOAN + u.INTEREST;
          const collector = c.assignments?.[0] ? nameOf.get(c.assignments[0].collectorId) : null;
          return (
            <Card style={{ gap: 4, padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" numberOfLines={1}>
                    {c.name}
                  </AppText>
                  <AppText size={12} color="textMuted">
                    #{c.accountNo}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </AppText>
                </View>
                <Pressable hitSlop={8} style={{ padding: 8 }} onPress={() => (guard() ? setForm({ open: true, item: c }) : undefined)}>
                  <Icon name="edit-2" size={18} color="textMuted" />
                </Pressable>
                <Pressable hitSlop={8} style={{ padding: 8 }} onPress={() => remove(c)}>
                  <Icon name="trash-2" size={18} color="danger" />
                </Pressable>
              </View>
              <AppText size={12} color="textMuted">
                {collector ? `${t('Collector')}: ${collector}` : t('Not assigned')}
                {sum > 0 ? ` · ${t('usual')} ${formatMoney(sum)}` : ''}
              </AppText>
            </Card>
          );
        }}
      />
      <CustomerFormSheet
        visible={form.open}
        initial={form.item as any}
        onClose={() => setForm({ open: false, item: null })}
        onSaved={async () => {
          setForm({ open: false, item: null });
          toast.success(t('Customer saved'));
          await refresh();
        }}
      />
    </View>
  );
}
