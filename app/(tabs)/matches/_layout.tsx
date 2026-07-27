import { Stack } from 'expo-router';

// No native headers anywhere in this app (see app/(tabs)/_layout.tsx) — each
// screen below builds its own in-content back link to match (the Partner
// Dossier's "BACK TO THE CARD" pill). Previously this Stack drew a native
// header with theme/tokens' dark-only colors, which read wrong in light mode.
export default function MatchesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
