import React, { memo, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AppText } from '@/components/ui';
import { FONT } from '@/components/ui/text';
import { formatNum } from '@/lib/format';
import { radius, useTheme } from '@/theme';

export type MatrixRow = { key: string; sr: number | string; title: string; sub?: string; cells: number[]; total: number };

const ROW_H = 42;
const CELL_W = 64;
const TOTAL_W = CELL_W + 16;
const LEFT_W = 150;
/** Rows drawn per step. The first step shows instantly; the rest are added in the background. */
const CHUNK = 30;

/**
 * Ledger grid: customer names stay fixed on the left while the day / month columns scroll sideways.
 *
 * Performance: a month sheet has ~150 rows x 32 cells (thousands of views). Every cell is ONE plain <Text>
 * (no wrapper View, no per-cell theme lookup), rows are memoised, and rows are mounted in chunks so the
 * screen is usable immediately instead of freezing while everything is created at once.
 */
export function Matrix({ columns, rows, footer, footerTotal, totalLabel = 'Total', footerLabel = 'Total' }: { columns: string[]; rows: MatrixRow[]; footer: number[]; footerTotal: number; totalLabel?: string; footerLabel?: string }) {
  const theme = useTheme();
  const [count, setCount] = useState(CHUNK);

  // Restart the progressive rendering whenever a different sheet arrives
  useEffect(() => {
    setCount(CHUNK);
  }, [rows]);
  useEffect(() => {
    if (count >= rows.length) return;
    const id = setTimeout(() => setCount((c) => c + CHUNK), 16);
    return () => clearTimeout(id);
  }, [count, rows.length]);

  const shown = useMemo(() => rows.slice(0, count), [rows, count]);

  const styles = useMemo(() => {
    // Data rows carry a 1px bottom border inside ROW_H, so their cells are 1px shorter (keeps the names column aligned)
    const text = (w: number, extra: object = {}, h = ROW_H - 1) => ({
      width: w,
      height: h,
      lineHeight: h,
      paddingHorizontal: 6,
      textAlign: 'right' as const,
      fontSize: 12,
      fontFamily: FONT.regular,
      fontVariant: ['tabular-nums' as const],
      ...extra,
    });
    return {
      cell: text(CELL_W, { color: theme.text }),
      cellEmpty: text(CELL_W, { color: theme.textFaint }),
      total: text(TOTAL_W, { color: theme.text, fontFamily: FONT.bold, backgroundColor: theme.cardAlt }),
      footCell: text(CELL_W, { color: theme.text, fontFamily: FONT.bold }, ROW_H),
      footTotal: text(TOTAL_W, { color: theme.primary, fontFamily: FONT.bold }, ROW_H),
      headCell: text(CELL_W, { color: theme.primarySoftText, fontFamily: FONT.bold, fontSize: 11 }, ROW_H),
      headTotal: text(TOTAL_W, { color: theme.primarySoftText, fontFamily: FONT.bold, fontSize: 11 }, ROW_H),
      rowLine: { flexDirection: 'row' as const, height: ROW_H, borderBottomWidth: 1, borderBottomColor: theme.border },
    };
  }, [theme]);

  const head = { height: ROW_H, justifyContent: 'center' as const, backgroundColor: theme.primarySoft };

  return (
    <View>
      <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: theme.card }}>
        <View style={{ width: LEFT_W, borderRightWidth: 1, borderRightColor: theme.border }}>
          <View style={[head, { paddingHorizontal: 8 }]}>
            <AppText size={11} weight="bold" color="primarySoftText">
              #  ACCOUNT · NAME
            </AppText>
          </View>
          {shown.map((r) => (
            <NameCell key={r.key} row={r} border={theme.border} />
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
                <Text key={c} style={styles.headCell} numberOfLines={1}>
                  {c}
                </Text>
              ))}
              <Text style={styles.headTotal} numberOfLines={1}>
                {totalLabel}
              </Text>
            </View>
            {shown.map((r) => (
              <GridRow key={r.key} row={r} styles={styles} />
            ))}
            <View style={{ flexDirection: 'row', backgroundColor: theme.cardAlt }}>
              {footer.map((v, i) => (
                <Text key={i} style={styles.footCell} numberOfLines={1}>
                  {formatNum(v) || '·'}
                </Text>
              ))}
              <Text style={styles.footTotal} numberOfLines={1}>
                {formatNum(footerTotal) || '0'}
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
      {count < rows.length ? (
        <AppText size={11} color="textMuted" align="center" style={{ marginTop: 6 }}>
          {Math.min(count, rows.length)} / {rows.length}…
        </AppText>
      ) : null}
    </View>
  );
}

const NameCell = memo(function NameCell({ row: r, border }: { row: MatrixRow; border: string }) {
  return (
    <View style={{ height: ROW_H, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: border }}>
      <AppText size={12} weight="semibold" numberOfLines={1}>
        {r.sr}. {r.title}
      </AppText>
      {r.sub ? (
        <AppText size={10} color="textMuted" numberOfLines={1}>
          {r.sub}
        </AppText>
      ) : null}
    </View>
  );
});

const GridRow = memo(function GridRow({ row: r, styles }: { row: MatrixRow; styles: any }) {
  return (
    <View style={styles.rowLine}>
      {r.cells.map((v, i) => (
        <Text key={i} style={v ? styles.cell : styles.cellEmpty} numberOfLines={1}>
          {formatNum(v) || '·'}
        </Text>
      ))}
      <Text style={styles.total} numberOfLines={1}>
        {formatNum(r.total) || '0'}
      </Text>
    </View>
  );
});
