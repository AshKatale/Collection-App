import React from 'react';
import { router } from 'expo-router';
import { AppText, Card, Icon, Screen, FeatherName } from '@/components/ui';
import { SyncPill } from '@/components/sync-pill';
import { useT } from '@/context/settings';
import { View } from 'react-native';

export default function Reports() {
  const t = useT();
  const items: { title: string; text: string; icon: FeatherName; href: string }[] = [
    { title: t('Daily report'), text: t('Savings, loan and interest for one day'), icon: 'sun', href: '/reports/daily' },
    { title: t('Monthly sheet'), text: t('Customers × days ledger'), icon: 'calendar', href: '/reports/monthly' },
    { title: t('Yearly report'), text: t('Customers × months, April to March'), icon: 'bar-chart', href: '/reports/yearly' },
    { title: t('Customer statement'), text: t('Every transaction of one customer'), icon: 'user', href: '/reports/customer' },
  ];
  return (
    <Screen title={t('Reports')} right={<SyncPill />}>
      {items.map((i) => (
        <Card key={i.href} onPress={() => router.push(i.href as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Icon name={i.icon} size={26} color="primary" />
          <View style={{ flex: 1 }}>
            <AppText weight="bold">{i.title}</AppText>
            <AppText size={12} color="textMuted">
              {i.text}
            </AppText>
          </View>
          <Icon name="chevron-right" size={18} color="textFaint" />
        </Card>
      ))}
    </Screen>
  );
}
