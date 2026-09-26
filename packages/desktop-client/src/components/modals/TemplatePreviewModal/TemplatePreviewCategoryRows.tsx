import { Trans } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import type { TemplatePreviewCategory } from '@actual-app/core/server/budget/goal-template';

import { isRemainderOnly, requestedTotal } from './requestedTotal';
import { TemplatePreviewRow } from './TemplatePreviewRow';

type TemplatePreviewCategoryRowsProps = {
  name: string;
  category: TemplatePreviewCategory;
  onChangeAmount: (templateIndex: number, amount: number) => Promise<void>;
};

export function TemplatePreviewCategoryRows({
  name,
  category,
  onChangeAmount,
}: TemplatePreviewCategoryRowsProps) {
  const requested = isRemainderOnly(category) ? null : requestedTotal(category);

  if (category.lines.length === 1) {
    const [line] = category.lines;
    return (
      <TemplatePreviewRow
        name={name}
        depth={1}
        templateText={line.templateText}
        editableAmount={line.editableAmount}
        requested={requested}
        budgeted={category.budgeted}
        onChangeAmount={amount => onChangeAmount(0, amount)}
      />
    );
  }

  return (
    <>
      <TemplatePreviewRow
        name={name}
        depth={1}
        templateText=""
        editableAmount={null}
        requested={requested}
        budgeted={category.budgeted}
      />
      {category.lines.map((line, index) => (
        <TemplatePreviewRow
          key={index}
          name={
            line.label ?? (
              <span
                style={{ fontStyle: 'italic', color: theme.tableTextLight }}
              >
                <Trans>No description</Trans>
              </span>
            )
          }
          depth={2}
          templateText={line.templateText}
          editableAmount={line.editableAmount}
          requested={line.isRemainder ? null : line.requested}
          budgeted={null}
          onChangeAmount={amount => onChangeAmount(index, amount)}
        />
      ))}
    </>
  );
}
