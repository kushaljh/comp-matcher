import { Stack } from 'expo-router';

// No native headers anywhere in this app (see app/(tabs)/_layout.tsx) — each
// screen below builds its own in-content back link to match.
export default function EventsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
