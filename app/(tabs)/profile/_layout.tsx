import { Stack } from 'expo-router';

// No native headers anywhere in this app (see app/(tabs)/_layout.tsx) — each
// screen below builds its own in-content back link to match. Added alongside
// admin.tsx so profile becomes a proper nested stack (previously just one
// screen, matching the events/ folder's own _layout.tsx).
export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
