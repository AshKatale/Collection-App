import React from 'react';
import { ScrollView, View } from 'react-native';
import { AppText } from '@/components/ui';
import { formatNum } from '@/lib/format';
import { radius, useTheme } from '@/theme';

export type MatrixRow = { key: string; sr: number | string; title: string; sub?: string; cells: number[]; total: number };

const ROW_H = 42;
const CELL_W = 64;
const LEFT_W = 150;

/** Ledger grid: customer names stay fixed on the left while the day / month columns scroll sideways. */
export function Matrix({ columns, rows, footer, footerTotal, totalLabel = 'Total', footerLabel = 'Total' }: { columns: string[]; rows: MatrixRow[]; footer: number[]; footerTotal: number; totalLabel?: string; footerLabel?: string }) {
  const theme = useTheme();
  const head = { height: ROW_H, justifyContent: 'center' as const, backgroundColor: theme.primarySoft };
  const cell = (w: number, bold = false, bg?: string) => ({ width: w, height: ROW_H, justifyContent: 'center' as const, alignItems: 'flex-end' as const, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: bg });

  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: theme.card }}>
      <View style={{ width: LEFT_W, borderRightWidth: 1, borderRightColor: theme.border }}>
        <View style={[head, { paddingHorizontal: 8 }]}>
          <AppText size={11} weight="bold" color="primarySoftText">
            #  ACCOUNT · NAME
          </AppText>
        </View>
        {rows.map((r) => (
          <View key={r.key} style={{ height: ROW_H, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <AppText size={12} weight="semibold" numberOfLines={1}>
              {r.sr}. {r.title}
            </AppText>
            {r.sub ? (
              <AppText size={10} color="textMuted" numberOfLines={1}>
                {r.sub}
              </AppText>
            ) : null}
          </View>
        ))}
        <View style={{ height: ROW_H, justifyContent: 'center', paddingHorizontal: 8, backgroundColor: theme.cardAlt }}>
          <AppText size={12} weight="bold">
            {footerLabel}
          </AppText>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
        <View>
          <View style={[head, { flexDirection: 'row' }]}>
            {columns.map((c) => (
              <View key={c} style={{ width: CELL_W, alignItems: 'flex-end', paddingHorizontal: 6, justifyContent: 'center' }}>
                <AppText size={11} weight="bold" color="primarySoftText">
                  {c}
                </AppText>
              </View>
            ))}
            <View style={{ width: CELL_W + 16, alignItems: 'flex-end', paddingHorizontal: 6, justifyContent: 'center' }}>
              <AppText size={11} weight="bold" color="primarySoftText">
                {totalLabel}
              </AppText>
            </View>
          </View>
          {rows.map((r) => (
            <View key={r.key} style={{ flexDirection: 'row' }}>
              {r.cells.map((v, i) => (
                <View key={i} style={cell(CELL_W)}>
                  <AppText size={12} tabular color={v ? 'text' : 'textFaint'}>
                    {formatNum(v) || '·'}
                  </AppText>
                </View>
              ))}
              <View style={cell(CELL_W + 16, true, theme.cardAlt)}>
                <AppText size={12} weight="bold" tabular>
                  {formatNum(r.total) || '0'}
                </AppText>
              </View>
            </View>
          ))}
          <View style={{ flexDirection: 'row', backgroundColor: theme.cardAlt }}>
            {footer.map((v, i) => (
              <View key={i} style={{ width: CELL_W, height: ROW_H, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 6 }}>
                <AppText size={12} weight="bold" tabular>
                  {formatNum(v) || '·'}
                </AppText>
              </View>
            ))}
            <View style={{ width: CELL_W + 16, height: ROW_H, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 6 }}>
              <AppText size={12} weight="bold" tabular color="primary">
                {formatNum(footerTotal) || '0'}
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
