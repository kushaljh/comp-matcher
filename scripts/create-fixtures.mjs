// ============================================================================
// Comp Matcher — test fixtures
// ----------------------------------------------------------------------------
// Creates 4 confirmed test users with profiles, contacts, competition history,
// and contest entries. Idempotent: users are looked up by email and profiles/
// contacts/entries are upserted, so re-running just reconciles state.
//
// Usage:  node scripts/create-fixtures.mjs
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (server-only; bypasses RLS)
//
// The 4 users are shaped to exercise the deck filters:
//   leader1  (leader,   novice,   CalBal "Strictly Balboa")  \ mutual-matchable
//   follower1(follower, novice,   CalBal "Strictly Balboa")  /
//   leader2  (leader,   advanced, CalBal "Strictly Balboa")  -> wrong division: NOT in follower1's novice deck
//   follower2(follower, novice,   CalBal "Strictly Lindy")   -> wrong contest:  NOT in follower1's deck
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// --- tiny .env parser (no dotenv dependency) --------------------------------
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

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- seeded contest ids (must match supabase/seed.sql) ----------------------
const CB_STRICTLY_BALBOA = 'b2222222-0000-4000-8000-000000000001'; // {novice,amateur,advanced,open}
const CB_STRICTLY_LINDY  = 'b2222222-0000-4000-8000-000000000002'; // {novice,advanced,open}

const PASSWORD = 'Fixture123!';

const FIXTURES = [
  {
    email: 'leader1@fixture.test', role: 'leader', display_name: 'Leo Leader',
    bio: 'Balboa leader, loves fast swing-outs.', values: ['musicality', 'connection'],
    entry: { contest_id: CB_STRICTLY_BALBOA, division: 'novice', note: 'Looking for a novice Bal partner!' },
    contacts: [
      { platform: 'instagram', handle: '@leo_leads' },
      { platform: 'email', handle: 'leader1@fixture.test' },
    ],
    history: [
      { event_name: 'Camp Hollywood', year: 2025, contest_name: 'Strictly Balboa', placement: 'Finalist' },
    ],
  },
  {
    email: 'follower1@fixture.test', role: 'follower', display_name: 'Fiona Follower',
    bio: 'Follower who lives for Balboa.', values: ['musicality', 'fun'],
    entry: { contest_id: CB_STRICTLY_BALBOA, division: 'novice', note: 'First novice comp — so excited!' },
    contacts: [
      { platform: 'instagram', handle: '@fiona_follows' },
      { platform: 'whatsapp', handle: '+15550001111' },
    ],
    history: [
      { event_name: 'All Balboa Weekend', year: 2025, contest_name: 'Strictly Balboa', placement: null },
    ],
  },
  {
    email: 'leader2@fixture.test', role: 'leader', display_name: 'Advanced Andy',
    bio: 'Advanced leader, many years in.', values: ['precision', 'partnership'],
    entry: { contest_id: CB_STRICTLY_BALBOA, division: 'advanced', note: 'Advanced division only.' },
    contacts: [
      { platform: 'facebook', handle: 'andy.advanced' },
      { platform: 'email', handle: 'leader2@fixture.test' },
    ],
    history: [
      { event_name: 'California Balboa Classic', year: 2024, contest_name: 'Strictly Balboa', placement: '1st' },
      { event_name: 'Balboa Rendezvous', year: 2025, contest_name: 'Strictly Balboa', placement: '2nd' },
    ],
  },
  {
    email: 'follower2@fixture.test', role: 'follower', display_name: 'Nova Novice',
    bio: 'Novice follower in the Lindy contest.', values: ['fun', 'community'],
    entry: { contest_id: CB_STRICTLY_LINDY, division: 'novice', note: 'A different contest entirely.' },
    contacts: [
      { platform: 'instagram', handle: '@nova_novice' },
      { platform: 'tiktok', handle: '@nova.dances' },
    ],
    history: [
      { event_name: 'Camp Hollywood', year: 2025, contest_name: 'Strictly Lindy', placement: null },
    ],
  },
];

// --- helpers ----------------------------------------------------------------
async function findUserByEmail(email) {
  // Small project: page through admin.listUsers until we find the email.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

async function ensureUser(email) {
  const existing = await findUserByEmail(email);
  if (existing) return { id: existing.id, created: false };
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw error;
  return { id: data.user.id, created: true };
}

async function upsertFixture(f) {
  const { id: userId, created } = await ensureUser(f.email);

  // profile (one per user_id)
  const { data: prof, error: pErr } = await supabase
    .from('profiles')
    .upsert(
      { user_id: userId, display_name: f.display_name, role: f.role, bio: f.bio, values: f.values },
      { onConflict: 'user_id' },
    )
    .select('id')
    .single();
  if (pErr) throw pErr;
  const profileId = prof.id;

  // contacts (unique per profile+platform)
  const { error: cErr } = await supabase
    .from('profile_contacts')
    .upsert(
      f.contacts.map((c) => ({ profile_id: profileId, platform: c.platform, handle: c.handle })),
      { onConflict: 'profile_id,platform' },
    );
  if (cErr) throw cErr;

  // competition history (no natural key -> replace)
  const { error: dhErr } = await supabase.from('competition_history').delete().eq('profile_id', profileId);
  if (dhErr) throw dhErr;
  const { error: hErr } = await supabase
    .from('competition_history')
    .insert(f.history.map((h) => ({ profile_id: profileId, ...h })));
  if (hErr) throw hErr;

  // entry (unique per profile+contest) — validated against contest divisions by trigger
  const { error: eErr } = await supabase
    .from('entries')
    .upsert(
      { profile_id: profileId, contest_id: f.entry.contest_id, division: f.entry.division, note: f.entry.note },
      { onConflict: 'profile_id,contest_id' },
    );
  if (eErr) throw eErr;

  return {
    email: f.email,
    role: f.role,
    division: f.entry.division,
    contest: f.entry.contest_id === CB_STRICTLY_BALBOA ? 'CalBal / Strictly Balboa' : 'CalBal / Strictly Lindy',
    user: created ? 'created' : 'existing',
  };
}

// --- main -------------------------------------------------------------------
(async () => {
  const summary = [];
  for (const f of FIXTURES) {
    try {
      summary.push(await upsertFixture(f));
    } catch (err) {
      console.error(`Failed for ${f.email}:`, err.message || err);
      process.exit(1);
    }
  }

  console.log('\nFixtures ready (password for all: %s):\n', PASSWORD);
  console.table(summary);
  console.log('\nleader1 + follower1 can mutual-match in CalBal "Strictly Balboa" (novice).');
  console.log('leader2 (advanced) and follower2 (different contest) must NOT appear in follower1\'s deck.');
})();
