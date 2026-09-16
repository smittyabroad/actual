import React from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useSheetValue } from '#hooks/useSheetValue';
import { envelopeBudget } from '#spreadsheet/bindings';

// Below this fraction of the budget remaining, the bar switches to a warning
// tint so a low category stands out without needing to read the number.
const LOW_REMAINING_THRESHOLD = 0.2;

// Kept deliberately faint — this is a background hint, not a chart.
const FILL_OPACITY = '13%';

type BalanceProgressBarProps = {
  categoryId: string;
};

/**
 * A faint bar behind the balance cell showing how much of this month's
 * budget is still left in the category. Purely decorative: the balance
 * amount itself remains the accessible value.
 */
export function BalanceProgressBar({ categoryId }: BalanceProgressBarProps) {
  const budgeted = useSheetValue<'envelope-budget', 'budget'>(
    envelopeBudget.catBudgeted(categoryId),
  );
  const balance = useSheetValue<'envelope-budget', 'leftover'>(
    envelopeBudget.catBalance(categoryId),
  );

  // Nothing budgeted means there is no "percentage left" to show.
  if (!budgeted || budgeted <= 0 || balance == null) {
    return null;
  }

  const isOverspent = balance <= 0;
  const remaining = isOverspent ? 1 : Math.min(balance / budgeted, 1);
  const color = isOverspent
    ? theme.errorText
    : remaining <= LOW_REMAINING_THRESHOLD
      ? theme.warningText
      : theme.noticeText;

  return (
    <View
      aria-hidden
      style={{
        position: 'absolute',
        top: 4,
        bottom: 4,
        right: 0,
        width: `${remaining * 100}%`,
        borderRadius: 2,
        pointerEvents: 'none',
        backgroundColor: `color-mix(in srgb, ${color} ${FILL_OPACITY}, transparent)`,
      }}
    />
  );
}
