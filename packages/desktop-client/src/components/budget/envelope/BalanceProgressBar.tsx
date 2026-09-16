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
const RAIL_BOTTOM = 3;
const RAIL_HEIGHT = 4;

// The track spans the full width at every row, which is what makes a fill
// readable as a proportion — without it there is no visible "100%" to
// measure against.
const TRACK_OPACITY = '28%';
const FILL_OPACITY = '75%';
const NOTCH_OPACITY = '75%';

// Quarter marks, with the halfway one drawn larger so the eye lands on the
// midpoint first and reads the quarters as secondary.
const NOTCHES = [
  { at: 0.25, width: 1, height: RAIL_HEIGHT, bottom: RAIL_BOTTOM },
  { at: 0.5, width: 2, height: RAIL_HEIGHT + 4, bottom: RAIL_BOTTOM - 2 },
  { at: 0.75, width: 1, height: RAIL_HEIGHT, bottom: RAIL_BOTTOM },
];

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

  // The drawable span, once both insets are taken off the cell's width.
  const span = `(100% - ${RAIL_INSET * 2}px)`;

  const railStyle = {
    position: 'absolute',
    bottom: RAIL_BOTTOM,
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
          width: `calc(${span} * ${remaining})`,
          backgroundColor: `color-mix(in srgb, ${color} ${FILL_OPACITY}, transparent)`,
        }}
      />
      {NOTCHES.map(notch => (
        <View
          key={notch.at}
          aria-hidden
          style={{
            position: 'absolute',
            bottom: notch.bottom,
            left: `calc(${RAIL_INSET}px + ${span} * ${notch.at})`,
            transform: 'translateX(-50%)',
            width: notch.width,
            height: notch.height,
            borderRadius: notch.width / 2,
            pointerEvents: 'none',
            backgroundColor: `color-mix(in srgb, ${theme.tableBorderSeparator} ${NOTCH_OPACITY}, transparent)`,
          }}
        />
      ))}
    </>
  );
}
