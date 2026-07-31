// The admin panel moved to its own tab (app/(tabs)/admin/). This route stays
// as a redirect so anything still pointing here — a bookmark, the button that
// used to live on Your Card — lands in the right place instead of 404ing.

import { Redirect } from 'expo-router';

export default function AdminRedirect() {
  return <Redirect href="/admin" />;
}
