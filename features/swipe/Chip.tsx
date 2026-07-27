import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';

type ChipProps = {
  label: string;
  variant?: 'division' | 'value';
};

// Small pill used for the division badge and the values tags on a card.
export function Chip({ label, variant = 'value' }: ChipProps) {
  const isDivision = variant === 'division';
  return (
    <View style={[styles.chip, isDivision ? styles.division : styles.value]}>
      <Text
        style={[styles.text, isDivision ? styles.divisionText : styles.valueText]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  division: {
    backgroundColor: colors.brass,
  },
  value: {
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  divisionText: {
    color: colors.navy,
    textTransform: 'capitalize',
  },
  valueText: {
    color: colors.textSecondary,
  },
});
