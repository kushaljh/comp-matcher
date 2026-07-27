import { Stack } from 'expo-router';
import { colors, fontWeights } from '../../../theme/tokens';

// A nested Stack so tapping a match pushes a detail screen while the tab bar
// (defined in app/(tabs)/_layout.tsx) stays put.
export default function MatchesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: fontWeights.semibold },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Matches' }} />
      <Stack.Screen name="[id]" options={{ title: 'Match' }} />
    </Stack>
  );
}
