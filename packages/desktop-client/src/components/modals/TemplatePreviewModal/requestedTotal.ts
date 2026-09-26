import type { TemplatePreviewCategory } from '@actual-app/core/server/budget/goal-template';

import { sum } from './sum';

// What a category's templates ask for, leaving out remainder lines since
// those only take whatever is left once everything else is funded.
export function requestedTotal(category: TemplatePreviewCategory) {
  return sum(
    category.lines.filter(line => !line.isRemainder).map(l => l.requested),
  );
}

export function isRemainderOnly(category: TemplatePreviewCategory) {
  return category.lines.every(line => line.isRemainder);
}
