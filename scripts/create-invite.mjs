// ============================================================================
// Comp Matcher — create-invite script
// ----------------------------------------------------------------------------
// Mints invite codes with the service role, bypassing the per-member quota.
// This is the bootstrap: once the before_user_created auth hook is enabled,
// nobody can sign up without a code, and if there is no member left to mint
// one from inside the app, this is the only way back in.
//
// The code is attributed to a real auth user (invites.created_by is NOT NULL
// and references auth.users). Pass --email to choose whom; the default is the
// oldest account in the project, which is almost always the owner.
//
// Usage:
//   node scripts/create-invite.mjs                    # 1 code, oldest account
//   node scripts/create-invite.mjs 5                  # 5 codes
//   node scripts/create-invite.mjs 3 --email you@example.com
//
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// --- tiny .env parser (no dotenv dependency), matching scripts/grant-admin.mjs
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

const args = process.argv.slice(2);
const emailFlag = args.indexOf('--email');
const email = emailFlag === -1 ? null : args[emailFlag + 1];
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 1);

if (!Number.isInteger(count) || count < 1 || count > 50) {
  console.error('usage: node scripts/create-invite.mjs [count 1-50] [--email someone@example.com]');
  process.exit(2);
}
if (emailFlag !== -1 && !email) {
  console.error('--email needs an address.');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Same paging approach as scripts/grant-admin.mjs's findUserByEmail.
async function listAllUsers() {
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

// The same alphabet create_invite() uses — no I/L/O/0/1, so a code read aloud
// or typed off a screenshot is unambiguous.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCode() {
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

try {
  const users = await listAllUsers();
  if (users.length === 0) {
    console.error('This project has no auth users yet, so an invite has nobody to belong to.');
    process.exit(1);
  }

  let owner;
  if (email) {
    owner = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!owner) {
      console.error(`No auth user found with email "${email}".`);
      process.exit(1);
    }
  } else {
    owner = users.reduce((a, b) => (new Date(a.created_at) <= new Date(b.created_at) ? a : b));
  }

  // The invitee needs a membership row of their own eventually; the inviter
  // needs one now, because every path that hands out codes assumes members.
  // A pre-invite-only account already has one from the migration's backfill —
  // this covers an owner created since.
  const { error: memberError } = await supabase
    .from('app_members')
    .upsert({ user_id: owner.id }, { onConflict: 'user_id' });
  if (memberError) throw memberError;

  // Inserted directly rather than through create_invite(): the RPC reads
  // auth.uid(), which is null for a service-role connection, and it would
  // apply the quota this script exists to sidestep.
  const rows = Array.from({ length: count }, () => ({
    code: generateCode(),
    created_by: owner.id,
  }));

  const { data, error } = await supabase.from('invites').insert(rows).select('code');
  if (error) throw error;

  console.log(`Created ${data.length} invite code(s) for ${owner.email}:`);
  for (const row of data) console.log(`  ${row.code}`);
  console.log('\nShare a code with one person each — every code works exactly once.');
} catch (err) {
  console.error(`Failed to create invites: ${err.message || err}`);
  process.exit(1);
}
