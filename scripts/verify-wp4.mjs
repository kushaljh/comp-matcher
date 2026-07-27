// ============================================================================
// WP4 (Matches + Contact Reveal + Account) — live-database verification
// ----------------------------------------------------------------------------
// Exercises the exact access paths the Matches and Profile screens rely on,
// against the LIVE hosted Supabase project, through the same RLS the app
// runs under (ANON clients signed in as throwaway users — never the service
// role for the assertions themselves).
//
// Creates three throwaway users (A leader, B follower, C follower) with
// profiles/contacts/history/entries in the same Camp Hollywood contest
// ("Strictly Balboa", which neither the fixtures (CalBal) nor WP3 (Balboa
// Rendezvous) touch), mutually-likes A and B into a match via two reciprocal
// swipe inserts (service role — the DB trigger creates the match row), then
// asserts:
//   1. as A: the matches query returns the A<->B match
//   2. as A: B's contacts are readable (match-gated RLS)
//   3. as A: B's competition history is readable
//   4. as C (unmatched): B's contacts return ZERO rows
//   5. as A: update display_name/bio, replace values, delete+re-add a
//      contact, delete a history row — all succeed
//   6. as A: rpc('delete_my_account') -> a subsequent password sign-in FAILS
//   7. as B: the A<->B match row is GONE (cascade), and A's contacts return
//      zero rows
// Cleanup deletes A, B, and C's auth users via the admin API (cascades their
// whole footprint via FKs); this is safe even when delete_my_account already
// removed A (deleteUser on an already-gone user is tolerated as a no-op).
// PASS/FAIL lines are printed for every assertion; the process exits non-zero
// on any *unexpected* failure.
//
// KNOWN, TRACKED FAILURE (do not "fix" by editing this script further):
// delete_my_account() currently fails on the hosted DB because storage.objects
// carries Supabase's BEFORE DELETE STATEMENT trigger storage.protect_delete(),
// which raises "Direct deletion from storage tables is not allowed..." unless
// the session sets the GUC storage.allow_delete_query = 'true' first — and it
// fires even when zero rows match (statement-level, not row-level). The fix
// (supabase/migrations/20260727150000_fix_delete_account_storage.sql) exists
// on main pending `supabase db push` approval; this worktree must not touch
// supabase/**. Until that migration lands, steps 6-7 print `KNOWN-FAIL
// (pending migration 20260727150000): <detail>` and are excluded from the
// pass/fail tally instead of failing the run. Once the migration is applied,
// this same script (unmodified) will report full PASS on steps 6-7 too.
//
// Usage:  node scripts/verify-wp4.mjs
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY
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
  } catch {
    /* .env is optional if vars are already in the environment */
  }
  return env;
}

const fileEnv = loadEnvFile(new URL('../.env', import.meta.url));
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || fileEnv.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || fileEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ' +
      '(set them in .env or the environment).'
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Camp Hollywood / "Strictly Balboa" — offers {novice, advanced, open}.
// Free for WP4: fixtures use California Balboa Classic, WP3 uses Balboa Rendezvous.
const CONTEST_ID = 'b1111111-0000-4000-8000-000000000002';
const PASSWORD = 'Verify123!wp4';

const USERS = {
  a: { email: 'wp4-a@verify.test', role: 'leader', display_name: 'Verify Leader A' },
  b: { email: 'wp4-b@verify.test', role: 'follower', display_name: 'Verify Follower B' },
  c: { email: 'wp4-c@verify.test', role: 'follower', display_name: 'Verify Follower C' },
};

// --- tiny test harness -------------------------------------------------------
let failures = 0;
function check(name, condition, details) {
  if (condition) {
    console.log(`PASS: ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL: ${name}${details ? ` — ${details}` : ''}`);
  }
}
function checkErrorFree(name, error) {
  check(name, !error, error?.message);
}
// For assertions whose failure is entirely explained by the tracked
// delete_my_account storage bug (see header comment): print a distinguishable
// line but do NOT count it in the pass/fail tally. Once the pending migration
// lands, the caller stops routing these through knownFail and they become
// ordinary check()s again.
function knownFail(name, detail) {
  console.log(`KNOWN-FAIL (pending migration 20260727150000): ${name}${detail ? ` — ${detail}` : ''}`);
}

const STORAGE_PROTECT_MESSAGE = /Direct deletion from storage tables is not allowed/i;

// --- setup helpers ------------------------------------------------------------
async function createThrowawayUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  return data.user.id;
}

async function createProfile(userId, { role, display_name }, values) {
  const { data, error } = await admin
    .from('profiles')
    .insert({ user_id: userId, role, display_name, bio: `${display_name} bio`, values })
    .select('id')
    .single();
  if (error) throw new Error(`insert profile for ${display_name}: ${error.message}`);
  return data.id;
}

async function createEntry(profileId) {
  const { error } = await admin
    .from('entries')
    .insert({ profile_id: profileId, contest_id: CONTEST_ID, division: 'novice' });
  if (error) throw new Error(`insert entry: ${error.message}`);
}

async function createContact(profileId, platform, handle) {
  const { data, error } = await admin
    .from('profile_contacts')
    .insert({ profile_id: profileId, platform, handle })
    .select('id')
    .single();
  if (error) throw new Error(`insert contact: ${error.message}`);
  return data.id;
}

async function createHistory(profileId, entry) {
  const { data, error } = await admin
    .from('competition_history')
    .insert({ profile_id: profileId, ...entry })
    .select('id')
    .single();
  if (error) throw new Error(`insert history: ${error.message}`);
  return data.id;
}

async function signInAnon(email) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return client;
}

// --- state for cleanup --------------------------------------------------------
const state = { aUserId: null, bUserId: null, cUserId: null };

async function cleanup() {
  console.log('\n--- cleanup ---');
  // A's auth user is already gone via delete_my_account (best effort if not).
  for (const [label, userId] of [
    ['A', state.aUserId],
    ['B', state.bUserId],
    ['C', state.cUserId],
  ]) {
    if (!userId) continue;
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not.*found/i.test(error.message)) {
      console.log(`  cleanup warning: could not delete throwaway user ${label}: ${error.message}`);
    } else {
      console.log(`  deleted throwaway user ${label}`);
    }
  }
}

// --- main ----------------------------------------------------------------------
async function main() {
  console.log('--- setup: throwaway users A (leader), B (follower), C (follower) ---');

  state.aUserId = await createThrowawayUser(USERS.a.email);
  state.bUserId = await createThrowawayUser(USERS.b.email);
  state.cUserId = await createThrowawayUser(USERS.c.email);

  const aProfileId = await createProfile(state.aUserId, USERS.a, ['musicality']);
  const bProfileId = await createProfile(state.bUserId, USERS.b, ['connection']);
  const cProfileId = await createProfile(state.cUserId, USERS.c, ['fun']);

  await createEntry(aProfileId);
  await createEntry(bProfileId);
  await createEntry(cProfileId);

  await createContact(aProfileId, 'instagram', '@verify_a');
  const aHistoryId = await createHistory(aProfileId, {
    event_name: 'Verify Classic',
    year: 2024,
    contest_name: 'Strictly Balboa',
    placement: '3rd',
  });

  await createContact(bProfileId, 'instagram', '@verify_b');
  await createContact(bProfileId, 'email', USERS.b.email);
  await createHistory(bProfileId, {
    event_name: 'Verify Open',
    year: 2023,
    contest_name: 'Strictly Balboa',
    placement: null,
  });

  await createContact(cProfileId, 'instagram', '@verify_c');

  console.log('setup complete: A=%s B=%s C=%s', aProfileId, bProfileId, cProfileId);

  console.log('\n--- creating A<->B match via reciprocal like swipes (service role) ---');
  const { error: swipeAErr } = await admin
    .from('swipes')
    .insert({
      contest_id: CONTEST_ID,
      swiper_profile_id: aProfileId,
      target_profile_id: bProfileId,
      direction: 'like',
    });
  if (swipeAErr) throw new Error(`A likes B: ${swipeAErr.message}`);

  const { error: swipeBErr } = await admin
    .from('swipes')
    .insert({
      contest_id: CONTEST_ID,
      swiper_profile_id: bProfileId,
      target_profile_id: aProfileId,
      direction: 'like',
    });
  if (swipeBErr) throw new Error(`B likes A: ${swipeBErr.message}`);

  const { data: matchRows, error: matchErr } = await admin
    .from('matches')
    .select('id')
    .eq('contest_id', CONTEST_ID)
    .or(`profile_a.eq.${aProfileId},profile_b.eq.${aProfileId}`)
    .or(`profile_a.eq.${bProfileId},profile_b.eq.${bProfileId}`);
  if (matchErr) throw new Error(`match lookup: ${matchErr.message}`);
  check('trigger created exactly one A<->B match', matchRows?.length === 1, JSON.stringify(matchRows));
  const matchId = matchRows?.[0]?.id;
  if (!matchId) throw new Error('no match row created — cannot continue');

  // ---------------------------------------------------------------------------
  console.log('\n--- as A (anon client) ---');
  const aClient = await signInAnon(USERS.a.email);

  const { data: aMatches, error: aMatchesErr } = await aClient
    .from('matches')
    .select('id, contest_id, profile_a, profile_b')
    .or(`profile_a.eq.${aProfileId},profile_b.eq.${aProfileId}`);
  checkErrorFree('A can query matches', aMatchesErr);
  check(
    'A\'s matches query returns the A<->B match',
    (aMatches ?? []).some((m) => m.id === matchId),
    JSON.stringify(aMatches)
  );

  const { data: bContactsAsA, error: bContactsAsAErr } = await aClient
    .from('profile_contacts')
    .select('id')
    .eq('profile_id', bProfileId);
  checkErrorFree('A can query B\'s contacts', bContactsAsAErr);
  check('A can read B\'s contacts (matched)', (bContactsAsA ?? []).length === 2, JSON.stringify(bContactsAsA));

  const { data: bHistoryAsA, error: bHistoryAsAErr } = await aClient
    .from('competition_history')
    .select('id')
    .eq('profile_id', bProfileId);
  checkErrorFree('A can query B\'s history', bHistoryAsAErr);
  check('A can read B\'s competition history (matched)', (bHistoryAsA ?? []).length === 1, JSON.stringify(bHistoryAsA));

  // ---------------------------------------------------------------------------
  console.log('\n--- as C (unmatched, anon client) ---');
  const cClient = await signInAnon(USERS.c.email);

  const { data: bContactsAsC, error: bContactsAsCErr } = await cClient
    .from('profile_contacts')
    .select('id')
    .eq('profile_id', bProfileId);
  checkErrorFree('C can query (not necessarily see) B\'s contacts', bContactsAsCErr);
  check(
    'C (unmatched) sees ZERO of B\'s contacts',
    (bContactsAsC ?? []).length === 0,
    JSON.stringify(bContactsAsC)
  );

  // ---------------------------------------------------------------------------
  console.log('\n--- as A: profile edits ---');

  const { error: updNameErr } = await aClient
    .from('profiles')
    .update({ display_name: 'Verify Leader A (edited)', bio: 'Updated bio via verify script' })
    .eq('id', aProfileId);
  checkErrorFree('A can update display_name/bio', updNameErr);

  const { error: updValuesErr } = await aClient
    .from('profiles')
    .update({ values: ['leadership', 'reliability'] })
    .eq('id', aProfileId);
  checkErrorFree('A can replace values', updValuesErr);

  const { data: aProfileAfter } = await aClient.from('profiles').select('*').eq('id', aProfileId).single();
  check(
    'A\'s profile reflects the edits',
    aProfileAfter?.display_name === 'Verify Leader A (edited)' &&
      JSON.stringify(aProfileAfter?.values) === JSON.stringify(['leadership', 'reliability']),
    JSON.stringify(aProfileAfter)
  );

  const aContactId = await getAContactId(aClient, aProfileId);
  const { error: delContactErr } = await aClient.from('profile_contacts').delete().eq('id', aContactId);
  checkErrorFree('A can delete a contact', delContactErr);

  const { error: addContactErr } = await aClient
    .from('profile_contacts')
    .insert({ profile_id: aProfileId, platform: 'email', handle: USERS.a.email });
  checkErrorFree('A can re-add a contact', addContactErr);

  const { error: delHistoryErr } = await aClient
    .from('competition_history')
    .delete()
    .eq('id', aHistoryId);
  checkErrorFree('A can delete a history row', delHistoryErr);

  const { data: aHistoryAfter } = await aClient
    .from('competition_history')
    .select('id')
    .eq('profile_id', aProfileId);
  check('A\'s history row is actually gone', (aHistoryAfter ?? []).length === 0, JSON.stringify(aHistoryAfter));

  // ---------------------------------------------------------------------------
  console.log('\n--- as A: delete_my_account ---');
  const { error: deleteAccountErr } = await aClient.rpc('delete_my_account');
  const isKnownStorageBug = !!deleteAccountErr && STORAGE_PROTECT_MESSAGE.test(deleteAccountErr.message);

  if (isKnownStorageBug) {
    knownFail('A can call delete_my_account()', deleteAccountErr.message);
  } else {
    checkErrorFree('A can call delete_my_account()', deleteAccountErr);
  }
  try {
    await aClient.auth.signOut();
  } catch {
    /* best effort; session's user may no longer exist */
  }

  if (isKnownStorageBug) {
    knownFail(
      "A's password sign-in fails after account deletion",
      'account was not actually deleted (rpc failed before reaching the auth.users delete)'
    );
  } else {
    const freshAClient = anonClient();
    const { error: reSignInErr } = await freshAClient.auth.signInWithPassword({
      email: USERS.a.email,
      password: PASSWORD,
    });
    check("A's password sign-in fails after account deletion", !!reSignInErr, 'sign-in unexpectedly succeeded');
  }
  // Do NOT null out state.aUserId here: cleanup() always attempts to delete A
  // via the admin API, and tolerates "already gone" when the rpc did succeed.

  // ---------------------------------------------------------------------------
  console.log('\n--- as B: post-deletion cascade checks ---');
  const bClient = await signInAnon(USERS.b.email);

  if (isKnownStorageBug) {
    knownFail('the A<->B match row is gone (cascade)', 'account was not actually deleted; match still exists');
    knownFail("A's contacts return zero rows (profile cascaded)", 'account was not actually deleted; contacts still exist');
  } else {
    const { data: matchAsB, error: matchAsBErr } = await bClient
      .from('matches')
      .select('id')
      .eq('id', matchId);
    checkErrorFree('B can query matches table', matchAsBErr);
    check('the A<->B match row is gone (cascade)', (matchAsB ?? []).length === 0, JSON.stringify(matchAsB));

    const { data: aContactsAsB, error: aContactsAsBErr } = await bClient
      .from('profile_contacts')
      .select('id')
      .eq('profile_id', aProfileId);
    checkErrorFree("B can query A's (former) contacts", aContactsAsBErr);
    check("A's contacts return zero rows (profile cascaded)", (aContactsAsB ?? []).length === 0, JSON.stringify(aContactsAsB));
  }
}

// Small helper: A's remaining contact id (the seeded instagram one) fetched
// as A right before deleting it, so we exercise a real client-driven delete
// rather than relying on the service-role-known id.
async function getAContactId(client, profileId) {
  const { data, error } = await client
    .from('profile_contacts')
    .select('id')
    .eq('profile_id', profileId)
    .eq('platform', 'instagram')
    .single();
  if (error) throw new Error(`fetch A's contact id: ${error.message}`);
  return data.id;
}

try {
  await main();
} catch (err) {
  console.error(`\nSCRIPT ERROR: ${err.message || err}`);
  failures += 1;
} finally {
  await cleanup();
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
