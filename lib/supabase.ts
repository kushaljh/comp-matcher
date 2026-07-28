import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file (see .env.example).'
  );
}

// On web, let supabase-js use its default storage (localStorage). On native,
// use AsyncStorage since localStorage isn't available.
const auth =
  Platform.OS === 'web'
    ? {
        persistSession: true,
        autoRefreshToken: true,
        // Consume auth tokens arriving in the URL hash (email confirmation,
        // password recovery links) so the click lands the user signed in.
        detectSessionInUrl: true,
      }
    : {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      };

/**
 * Whether this page load began with a password-recovery link.
 *
 * MUST be evaluated BEFORE createClient below — module statements run top to
 * bottom, which is the whole point of it living here.
 *
 * `detectSessionInUrl` consumes the fragment and clears the hash the moment the
 * client is constructed, which happens at module load. React has not mounted
 * yet, so SessionProvider's onAuthStateChange listener does not exist and never
 * hears the PASSWORD_RECOVERY event; by the time it subscribes, the hash is
 * gone and the recovery session is indistinguishable from an ordinary sign-in.
 * That put a user who clicked a reset link straight into the tabs with nothing
 * reset — verified against a real recovery link before this was added.
 *
 * Reading the hash here, one statement earlier, is what makes it observable.
 */
export const startedInPasswordRecovery =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  /(^|[#&])type=recovery(&|$)/.test(window.location.hash);

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth,
});
