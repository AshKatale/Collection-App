import type { EntryType } from '@/api/endpoints';
import type { Palette } from '@/theme';
import type { LocalCustomer } from '@/db/repo';

export const TYPES: EntryType[] = ['SAVINGS', 'LOAN', 'INTEREST'];
export const TYPE_LABELS: Record<EntryType, string> = { SAVINGS: 'Savings', LOAN: 'Loan repayment', INTEREST: 'Interest' };
export const TYPE_SHORT: Record<EntryType, string> = { SAVINGS: 'S', LOAN: 'L', INTEREST: 'I' };

export const typeColors = (theme: Palette, type: EntryType) =>
  type === 'SAVINGS' ? { bg: theme.successSoft, fg: theme.success } : type === 'LOAN' ? { bg: theme.blueSoft, fg: theme.blueText } : { bg: theme.warnSoft, fg: theme.warnText };

/** Customer's usual amount per type (old customers: the single legacy amount counts as Savings). */
export const usualOf = (c: Pick<LocalCustomer, 'defaultSavings' | 'defaultLoan' | 'defaultInterest' | 'defaultDailyAmount'>): Record<EntryType, number> => ({
  SAVINGS: Number(c.defaultSavings ?? c.defaultDailyAmount) || 0,
  LOAN: Number(c.defaultLoan) || 0,
  INTEREST: Number(c.defaultInterest) || 0,
});
