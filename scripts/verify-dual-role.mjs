// ============================================================================
// Comp Matcher — dual-role verification
// ----------------------------------------------------------------------------
// The case no other script covers: ONE dancer entering ONE contest as BOTH a
// leader and a follower. Everything else in the suite assumes a dancer has a
// single role, which was true until role moved from `profiles` to `entries`.
//
// Two dancers (X and Y) each enter the same contest twice, once per role, in
// the same division. That gives two independent pairings:
//     X-as-leader   <-> Y-as-follower
//     X-as-follower <-> Y-as-leader
//
// Asserts, all through the ANON client so RLS and the triggers are exercised
// exactly as the app exercises them:
//   1. Each entry deals its own deck, and each deck contains only the opposite
//      role.
//   2. A like from the leader deck does not consume the follower deck's card.
//   3. Mutual likes on both sides create TWO distinct match rows, differing
//      only in profile_a_role.
//   4. Withdrawing the leader entry dissolves ONLY the leader-side match and
//      leaves the follower-side pairing intact.
//
// Idempotent: users are looked up by email, and all four entries plus any
// swipes/matches are torn down and rebuilt on each run.
//
// Usage:  node scripts/verify-dual-role.mjs
// Needs:  EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
//         SUPABASE_SERVICE_ROLE_KEY   (from .env at repo root)
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(url) {
  const env = {};
  try {
    for (const line of readFileSync(fileURLToPath(url), 'utf8').split('\n')) {
      if (/^\s*#/.test(line) || !line.includes('=')) continue;
      const i = line.indexOf('=');
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* optional */ }
  return env;
}

const fileEnv = loadEnvFile(new URL('../.env', import.meta.url));
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || fileEnv.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || fileEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Seeded contest with {novice,amateur,advanced,open} — matches supabase/seed.sql.
const CONTEST = 'b2222222-0000-4000-8000-000000000001';
const DIVISION = 'amateur'; // kept off 'novice' so demo dancers don't crowd the deck
const PASSWORD = 'DualRole123!';

const DANCERS = [
  { email: 'dual-x@fixture.test', name: 'Dual Xavier' },
  { email: 'dual-y@fixture.test', name: 'Dual Yvonne' },
];

let failures = 0;
function check(ok, msg) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures++;
}
const die = (msg) => {
  console.error(`SETUP FAILED: ${msg}`);
  process.exit(1);
};

// --- setup ------------------------------------------------------------------

async function ensureUser(email) {
  // listUsers is paginated; the fixture set is tiny so one page suffices.
  const { data: list, error: lErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (lErr) die(`listUsers: ${lErr.message}`);
  const found = list.users.find((u) => u.email === email);
  if (found) return found.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) die(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

async function ensureProfile(userId, name) {
  const { data, error } = await admin
    .from('profiles')
    .upsert({ user_id: userId, display_name: name, values: [] }, { onConflict: 'user_id' })
    .select('id')
    .single();
  if (error) die(`profile ${name}: ${error.message}`);
  return data.id;
}

const profileIds = {};
for (const d of DANCERS) {
  const userId = await ensureUser(d.email);
  profileIds[d.email] = await ensureProfile(userId, d.name);
}
const [X, Y] = DANCERS.map((d) => profileIds[d.email]);

// Clean slate: drop this contest's swipes/matches/entries for both dancers.
// Deleting entries also fires the dissolve trigger, so matches go first anyway.
for (const table of ['matches', 'swipes', 'entries']) {
  const col = table === 'matches' ? 'profile_a' : table === 'swipes' ? 'swiper_profile_id' : 'profile_id';
  const { error } = await admin.from(table).delete().eq('contest_id', CONTEST).in(col, [X, Y]);
  if (error) die(`cleanup ${table}: ${error.message}`);
  if (table === 'matches') {
    const { error: e2 } = await admin.from('matches').delete().eq('contest_id', CONTEST).in('profile_b', [X, Y]);
    if (e2) die(`cleanup matches (b): ${e2.message}`);
  }
}

// Both dancers enter the same contest and division at BOTH roles: 4 entries.
const entryIds = {};
for (const [label, profileId] of [['X', X], ['Y', Y]]) {
  for (const role of ['leader', 'follower']) {
    const { data, error } = await admin
      .from('entries')
      .insert({ profile_id: profileId, contest_id: CONTEST, division: DIVISION, role })
      .select('id')
      .single();
    if (error) die(`entry ${label}/${role}: ${error.message}`);
    entryIds[`${label}:${role}`] = data.id;
  }
}
console.log(`setup: 4 entries in one contest/division (X and Y, each leading AND following)\n`);

// --- signed-in clients ------------------------------------------------------

async function clientFor(email) {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) die(`sign-in ${email}: ${error.message}`);
  return c;
}

const cx = await clientFor(DANCERS[0].email);
const cy = await clientFor(DANCERS[1].email);

const deck = async (client, entryId) => {
  const { data, error } = await client.rpc('get_deck', { p_entry_id: entryId });
  if (error) die(`get_deck: ${error.message}`);
  return data ?? [];
};

const swipe = async (client, swiperProfileId, swiperRole, targetProfileId, direction) => {
  const { error } = await client.from('swipes').insert({
    contest_id: CONTEST,
    swiper_profile_id: swiperProfileId,
    swiper_role: swiperRole,
    target_profile_id: targetProfileId,
    direction,
  });
  if (error) die(`swipe ${swiperRole} ${direction}: ${error.message}`);
};

// --- 1. two independent decks, each opposite-role only ----------------------

const xLeadDeck = await deck(cx, entryIds['X:leader']);
const xFollowDeck = await deck(cx, entryIds['X:follower']);

check(
  xLeadDeck.some((c) => c.profile_id === Y) && xLeadDeck.every((c) => c.role === 'follower'),
  "X's leader deck offers Y-as-follower, and only followers"
);
check(
  xFollowDeck.some((c) => c.profile_id === Y) && xFollowDeck.every((c) => c.role === 'leader'),
  "X's follower deck offers Y-as-leader, and only leaders"
);
check(
  !xLeadDeck.some((c) => c.profile_id === X) && !xFollowDeck.some((c) => c.profile_id === X),
  "neither of X's decks offers X their own other-role entry"
);

// --- 2. a like on one deck does not consume the other -----------------------

await swipe(cx, X, 'leader', Y, 'like');

const afterLead = await deck(cx, entryIds['X:leader']);
const afterFollow = await deck(cx, entryIds['X:follower']);

check(
  !afterLead.some((c) => c.profile_id === Y),
  'after liking as leader, Y is gone from the leader deck'
);
check(
  afterFollow.some((c) => c.profile_id === Y),
  'after liking as leader, Y-as-leader is STILL in the follower deck'
);

// --- 3. mutual likes on both sides create two distinct matches --------------

await swipe(cy, Y, 'follower', X, 'like'); // completes X-lead <-> Y-follow
await swipe(cx, X, 'follower', Y, 'like');
await swipe(cy, Y, 'leader', X, 'like'); // completes X-follow <-> Y-lead

const { data: matches, error: mErr } = await admin
  .from('matches')
  .select('id, profile_a, profile_b, profile_a_role')
  .eq('contest_id', CONTEST)
  .or(`profile_a.eq.${X},profile_b.eq.${X}`);
if (mErr) die(`matches read: ${mErr.message}`);

check(matches.length === 2, `two distinct pairings exist for the same dancer pair (got ${matches.length})`);
check(
  new Set(matches.map((m) => m.profile_a_role)).size === 2,
  'the two pairings differ only by profile_a_role'
);

// --- 4. withdrawing one role dissolves only that role's pairing -------------

const { error: dErr } = await admin.from('entries').delete().eq('id', entryIds['X:leader']);
if (dErr) die(`withdraw X leader entry: ${dErr.message}`);

const { data: left, error: lErr2 } = await admin
  .from('matches')
  .select('id, profile_a, profile_b, profile_a_role')
  .eq('contest_id', CONTEST)
  .or(`profile_a.eq.${X},profile_b.eq.${X}`);
if (lErr2) die(`matches re-read: ${lErr2.message}`);

check(left.length === 1, `withdrawing the leader entry leaves exactly one pairing (got ${left.length})`);

// The surviving pairing must be the one where X was FOLLOWING.
const survivor = left[0];
const xRoleInSurvivor =
  survivor.profile_a === X
    ? survivor.profile_a_role
    : survivor.profile_a_role === 'leader'
      ? 'follower'
      : 'leader';
check(xRoleInSurvivor === 'follower', "the surviving pairing is the one where X was following");

// X's follower-side swipes must also have survived the withdrawal.
const { data: swipesLeft, error: sErr } = await admin
  .from('swipes')
  .select('swiper_role')
  .eq('contest_id', CONTEST)
  .eq('swiper_profile_id', X);
if (sErr) die(`swipes re-read: ${sErr.message}`);
check(
  swipesLeft.length === 1 && swipesLeft[0].swiper_role === 'follower',
  "only X's leader-side swipes were cleared; the follower-side ones remain"
);

await cx.auth.signOut();
await cy.auth.signOut();

console.log(`\n${failures === 0 ? 'ALL DUAL-ROLE CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
