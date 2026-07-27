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

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth,
});
