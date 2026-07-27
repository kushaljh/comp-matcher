import { Redirect } from 'expo-router';

// The (tabs) group has no route mapped to "/" itself (each tab lives one
// level deeper, e.g. "/events"), so app launch needs an explicit redirect
// into a default tab.
export default function Index() {
  return <Redirect href="/events" />;
}
