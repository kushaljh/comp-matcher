// The Admin tab's stack: a landing menu plus one screen per area.
//
// Split into sub-pages rather than one long scroll because the panel now
// carries three unrelated jobs — event moderation, the dancer roster, and
// invites — and scrolling past two of them to reach the third gets old fast.

import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="events" />
      <Stack.Screen name="dancers" />
      <Stack.Screen name="invites" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="log" />
    </Stack>
  );
}
