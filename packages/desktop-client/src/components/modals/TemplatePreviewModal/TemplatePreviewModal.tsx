import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type { TemplatePreview } from '@actual-app/core/server/budget/goal-template';
import * as monthUtils from '@actual-app/core/shared/months';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { FinancialText } from '#components/FinancialText';
import { Field, Row, TableHeader } from '#components/table';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import type { Modal as ModalType } from '#modals/modalsSlice';

import { isRemainderOnly, requestedTotal } from './requestedTotal';
import { sum } from './sum';
import { TemplatePreviewCategoryRows } from './TemplatePreviewCategoryRows';
import { TemplatePreviewSummaryTile } from './TemplatePreviewSummaryTile';

type TemplatePreviewModalProps = Extract<
  ModalType,
  { name: 'template-preview' }
>['options'];

export function TemplatePreviewModal({ month }: TemplatePreviewModalProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const format = useFormat();
  const { data: categories } = useCategories();
  const [preview, setPreview] = useState<TemplatePreview | null>(null);

  async function loadPreview() {
    setPreview(await send('budget/preview-templates', { month }));
  }

  useEffect(() => {
    let isCancelled = false;
    void send('budget/preview-templates', { month }).then(result => {
      if (!isCancelled) setPreview(result);
    });
    return () => {
      isCancelled = true;
    };
  }, [month]);

  async function onChangeAmount(
    categoryId: string,
    templateIndex: number,
    amount: number,
  ) {
    await send('budget/set-template-amount', {
      categoryId,
      templateIndex,
      amount,
    });
    await loadPreview();
  }

  const previewById = new Map(
    (preview?.categories ?? []).map(category => [category.id, category]),
  );
  const groups = (categories?.grouped ?? [])
    .map(group => ({
      group,
      rows: (group.categories ?? []).flatMap(category => {
        const row = previewById.get(category.id);
        return row ? [{ name: category.name, row }] : [];
      }),
    }))
    .filter(({ rows }) => rows.length > 0);

  const fixedCategories = (preview?.categories ?? []).filter(
    c => !isRemainderOnly(c),
  );
  const totalRequested = sum(fixedCategories.map(requestedTotal));
  const totalBudgeted = sum(fixedCategories.map(c => c.budgeted));

  return (
    <Modal
      name="template-preview"
      containerProps={{ style: { width: 860, maxWidth: '95vw' } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Budget templates for {{month}}', {
              month: monthUtils.format(month, 'MMMM yyyy', locale),
            })}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <Text style={{ color: theme.pageTextLight, marginBottom: 12 }}>
            <Trans>
              What each template asks for this month. Nothing is budgeted until
              you apply templates. Change an amount to update that category's
              template.
            </Trans>
          </Text>

          {preview == null ? (
            <Text style={{ padding: 20, textAlign: 'center' }}>
              <Trans>Calculating…</Trans>
            </Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <TemplatePreviewSummaryTile
                  label={t('Templates ask for')}
                  value={format(totalRequested, 'financial')}
                />
                <TemplatePreviewSummaryTile
                  label={t('Budgeted now')}
                  value={format(totalBudgeted, 'financial')}
                />
                <TemplatePreviewSummaryTile
                  label={t('Difference')}
                  value={format(totalRequested - totalBudgeted, 'financial')}
                />
              </View>

              {preview.errors.length > 0 && (
                <View
                  style={{
                    backgroundColor: theme.warningBackground,
                    color: theme.warningText,
                    padding: 10,
                    borderRadius: 4,
                    marginBottom: 12,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  <Text style={{ fontWeight: 600 }}>
                    <Trans>Some templates could not be read:</Trans>
                  </Text>
                  <Text>{preview.errors.join('\n')}</Text>
                </View>
              )}

              <TableHeader>
                <Field width="flex">
                  <Trans>Category</Trans>
                </Field>
                <Field width={260}>
                  <Trans>Template</Trans>
                </Field>
                <Field width={110} style={{ textAlign: 'right' }}>
                  <Trans>Asks for</Trans>
                </Field>
                <Field width={110} style={{ textAlign: 'right' }}>
                  <Trans>Budgeted now</Trans>
                </Field>
              </TableHeader>
              <View style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {groups.map(({ group, rows }) => (
                  <View key={group.id} style={{ flexShrink: 0 }}>
                    <Row
                      style={{
                        backgroundColor: theme.tableRowHeaderBackground,
                        fontWeight: 600,
                      }}
                    >
                      <Field width="flex">{group.name}</Field>
                      <Field width={260} />
                      <Field width={110} style={{ textAlign: 'right' }}>
                        <FinancialText>
                          {format(
                            sum(rows.map(({ row }) => requestedTotal(row))),
                            'financial',
                          )}
                        </FinancialText>
                      </Field>
                      <Field width={110} />
                    </Row>
                    {rows.map(({ name, row }) => (
                      <TemplatePreviewCategoryRows
                        key={row.id}
                        name={name}
                        category={row}
                        onChangeAmount={(templateIndex, amount) =>
                          onChangeAmount(row.id, templateIndex, amount)
                        }
                      />
                    ))}
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
