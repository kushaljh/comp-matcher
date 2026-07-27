import { Text } from 'react-native';
import { Screen } from '../../../theme/components';
import { fontSizes, fontWeights } from '../../../theme/tokens';

export default function EventsScreen() {
  return (
    <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: fontSizes.lg, fontWeight: fontWeights.semibold }}>
        Events — coming soon
      </Text>
    </Screen>
  );
}
