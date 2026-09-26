import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { FinancialText } from '#components/FinancialText';
import { Field, Row } from '#components/table';
import { useFormat } from '#hooks/useFormat';

type TemplatePreviewRowProps = {
  name: ReactNode;
  depth: 1 | 2;
  templateText: string;
  editableAmount: number | null;
  // null means the row only gets whatever is left (remainder templates)
  requested: number | null;
  budgeted: number | null;
  onChangeAmount?: (amount: number) => Promise<void>;
};

export function TemplatePreviewRow({
  name,
  depth,
  templateText,
  editableAmount,
  requested,
  budgeted,
  onChangeAmount,
}: TemplatePreviewRowProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [draft, setDraft] = useState(String(editableAmount ?? ''));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(String(editableAmount ?? ''));
  }, [editableAmount]);

  async function commit(value: string) {
    const amount = Number(value.replace(/[^0-9.]/g, ''));
    if (
      !onChangeAmount ||
      value.trim() === '' ||
      !Number.isFinite(amount) ||
      amount === editableAmount
    ) {
      setDraft(String(editableAmount ?? ''));
      return;
    }
    setIsSaving(true);
    try {
      await onChangeAmount(amount);
    } finally {
      setIsSaving(false);
    }
  }

  const isEditable = editableAmount != null && onChangeAmount != null;

  return (
    <Row style={{ backgroundColor: theme.tableBackground }}>
      <Field
        width="flex"
        style={{
          paddingLeft: depth * 20,
          color: depth === 2 ? theme.pageTextLight : undefined,
        }}
      >
        {name}
      </Field>
      <Field
        width={260}
        style={{ color: theme.pageTextLight }}
        title={templateText}
      >
        {isEditable ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Input
              aria-label={t('Template amount')}
              value={draft}
              disabled={isSaving}
              onChangeValue={setDraft}
              onUpdate={value => void commit(value)}
              onEnter={value => void commit(value)}
              onEscape={() => setDraft(String(editableAmount ?? ''))}
              style={{ width: 90, textAlign: 'right', ...styles.tnum }}
            />
            <Text style={{ fontSize: 12 }}>
              {/up to/i.test(templateText) ? t('fill up to') : t('each month')}
            </Text>
          </View>
        ) : (
          <Text
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 12,
            }}
          >
            {templateText}
          </Text>
        )}
      </Field>
      <Field width={110} style={{ textAlign: 'right' }}>
        {requested == null ? (
          <Text style={{ color: theme.pageTextLight, fontSize: 12 }}>
            <Trans>What's left</Trans>
          </Text>
        ) : (
          <FinancialText>{format(requested, 'financial')}</FinancialText>
        )}
      </Field>
      <Field
        width={110}
        style={{ textAlign: 'right', color: theme.pageTextLight }}
      >
        {budgeted != null && (
          <FinancialText>{format(budgeted, 'financial')}</FinancialText>
        )}
      </Field>
    </Row>
  );
}
