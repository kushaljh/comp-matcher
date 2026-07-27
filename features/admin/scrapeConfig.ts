import { Platform } from 'react-native';

// The Expo web export is deployed on Vercel, which also serves api/scrape-
// contests.mjs same-origin, so a relative path works there. Native builds
// have no "current origin" for a relative path to resolve against, so they
// need an absolute base — the deployed web app's own origin.
const NATIVE_API_BASE_URL = 'https://comp-matcher-web.vercel.app';

export const SCRAPE_CONTESTS_ENDPOINT =
  Platform.OS === 'web' ? '/api/scrape-contests' : `${NATIVE_API_BASE_URL}/api/scrape-contests`;
