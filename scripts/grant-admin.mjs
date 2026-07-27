// ============================================================================
// Comp Matcher — grant-admin script
// ----------------------------------------------------------------------------
// Grants admin panel access to an existing user by email: looks the user up
// via the service-role admin API, then upserts their admin_users row. This is
// the ONLY way to become an admin — admin_users has no user-facing insert
// policy (see supabase/migrations/20260728100000_admin.sql), so this always
// requires the service-role key (server-only; bypasses RLS).
//
// Usage:  node scripts/grant-admin.mjs <email>
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// --- tiny .env parser (no dotenv dependency), matching scripts/create-fixtures.mjs
function loadEnvFile(url) {
  const env = {};
  try {
    for (const line of readFileSync(fileURLToPath(url), 'utf8').split('\n')) {
      if (/^\s*#/.test(line) || !line.includes('=')) continue;
      const i = line.indexOf('=');
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* .env is optional if vars are already in the environment */ }
  return env;
}

const fileEnv = loadEnvFile(new URL('../.env', import.meta.url));
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || fileEnv.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in .env or the environment).');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('usage: node scripts/grant-admin.mjs <email>');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Small project: page through admin.listUsers until we find the email
// (mirrors scripts/create-fixtures.mjs's findUserByEmail).
async function findUserByEmail(targetEmail) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || '').toLowerCase() === targetEmail.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

try {
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`No auth user found with email "${email}". They must sign up in the app first.`);
    process.exit(1);
  }

  const { error } = await supabase
    .from('admin_users')
    .upsert({ user_id: user.id }, { onConflict: 'user_id' });
  if (error) throw error;

  console.log(`Granted admin access to ${email} (user_id ${user.id}).`);
} catch (err) {
  console.error(`Failed to grant admin access: ${err.message || err}`);
  process.exit(1);
}
