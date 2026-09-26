import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { FinancialText } from '#components/FinancialText';

type TemplatePreviewSummaryTileProps = {
  label: string;
  value: string;
};

export function TemplatePreviewSummaryTile({
  label,
  value,
}: TemplatePreviewSummaryTileProps) {
  return (
    <View
      style={{
        flex: 1,
        padding: 10,
        borderRadius: 4,
        backgroundColor: theme.tableRowHeaderBackground,
      }}
    >
      <Text style={{ fontSize: 12, color: theme.pageTextLight }}>{label}</Text>
      <FinancialText style={{ fontSize: 18, fontWeight: 600 }}>
        {value}
      </FinancialText>
    </View>
  );
}
