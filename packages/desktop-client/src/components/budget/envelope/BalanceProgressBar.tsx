import React from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useSheetValue } from '#hooks/useSheetValue';
import { envelopeBudget } from '#spreadsheet/bindings';

// Below this fraction of the budget remaining, the bar switches to a warning
// tint so a low category stands out without needing to read the number.
const LOW_REMAINING_THRESHOLD = 0.2;

// The rail is inset by the same 5px the cell's content is, so its ends line up
// with the balance text rather than the cell border.
const RAIL_INSET = 5;
const RAIL_HEIGHT = 4;

// The track spans the full width at every row, which is what makes a fill
// readable as a proportion — without it there is no visible "100%" to
// measure against.
const TRACK_OPACITY = '28%';
const FILL_OPACITY = '75%';

type BalanceProgressBarProps = {
  categoryId: string;
};

/**
 * A slim rail along the bottom of the balance cell showing how much of this
 * month's budget is still left in the category. Purely decorative: the balance
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

  const railStyle = {
    position: 'absolute',
    bottom: 3,
    left: RAIL_INSET,
    height: RAIL_HEIGHT,
    borderRadius: RAIL_HEIGHT / 2,
    pointerEvents: 'none',
  } as const;

  return (
    <>
      <View
        aria-hidden
        style={{
          ...railStyle,
          right: RAIL_INSET,
          backgroundColor: `color-mix(in srgb, ${theme.tableBorderSeparator} ${TRACK_OPACITY}, transparent)`,
        }}
      />
      <View
        aria-hidden
        style={{
          ...railStyle,
          width: `calc((100% - ${RAIL_INSET * 2}px) * ${remaining})`,
          backgroundColor: `color-mix(in srgb, ${color} ${FILL_OPACITY}, transparent)`,
        }}
      />
    </>
  );
}
