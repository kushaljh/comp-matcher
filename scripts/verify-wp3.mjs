// ============================================================================
// WP3 (Swipe Deck + Matching) — live verification against the hosted Supabase.
// ----------------------------------------------------------------------------
// Proves the deck filters, the mutual-like -> match flow, swipe permanence, and
// the swipe-insert RLS spoof guard, using THROWAWAY users (…@verify.test) in a
// California Balboa Classic contest (the flagship event). Fixture and demo
// profiles share these contests, so every assertion is MEMBERSHIP-based (has /
// not-has) — never an exact deck size. Throwaways are deleted at the end
// (deleteUser cascades), and no swipe ever targets a non-throwaway profile.
//
// Roles used:
//   A = leader,   novice     \ mutual-matchable with B
//   B = follower, novice     /  (the swiper we inspect)
//   C = leader,   advanced   -> excluded from B's deck by DIVISION
//   D = leader,   novice     -> a second candidate B can pass
//   E = follower, novice     -> must be excluded from B's deck by ROLE
//
// Usage:  node scripts/verify-wp3.mjs
// Needs (from .env): EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
//                    SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const PASSWORD = 'Verify123!';
const USERS = [
  { key: 'A', email: 'wp3-a-leader-novice@verify.test', role: 'leader', division: 'novice' },
  { key: 'B', email: 'wp3-b-follower-novice@verify.test', role: 'follower', division: 'novice' },
  { key: 'C', email: 'wp3-c-leader-advanced@verify.test', role: 'leader', division: 'advanced' },
  { key: 'D', email: 'wp3-d-leader-novice@verify.test', role: 'leader', division: 'novice' },
  { key: 'E', email: 'wp3-e-follower-novice@verify.test', role: 'follower', division: 'novice' },
];

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- assertion harness ------------------------------------------------------
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
}

// --- helpers ----------------------------------------------------------------
async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function deleteThrowaways() {
  for (const u of USERS) {
    const existing = await findUserByEmail(u.email);
    if (existing) await admin.auth.admin.deleteUser(existing.id);
  }
}

async function signIn(email) {
  const c = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

// get_deck takes an ENTRY id now — a contest id no longer identifies a deck,
// since a dancer may hold one entry per role in the same contest.
async function deckIds(client, entryId) {
  const { data, error } = await client.rpc('get_deck', { p_entry_id: entryId });
  if (error) throw new Error(`get_deck: ${error.message}`);
  return new Set((data ?? []).map((r) => r.profile_id));
}

async function insertSwipe(client, contestId, swiper, swiperRole, target, direction) {
  return client.from('swipes').insert({
    contest_id: contestId,
    swiper_profile_id: swiper,
    swiper_role: swiperRole,
    target_profile_id: target,
    direction,
  });
}

async function matchVisible(client, contestId, p1, p2) {
  const [a, b] = p1 < p2 ? [p1, p2] : [p2, p1];
  const { data, error } = await client
    .from('matches')
    .select('id')
    .eq('contest_id', contestId)
    .eq('profile_a', a)
    .eq('profile_b', b)
    .maybeSingle();
  if (error) throw new Error(`matches read: ${error.message}`);
  return !!data;
}

// --- main -------------------------------------------------------------------
let exitCode = 0;
try {
  // Resolve the Balboa Rendezvous "Strictly Balboa" contest and confirm it
  // offers the divisions this test needs (novice + advanced).
  const { data: contests, error: cErr } = await admin
    .from('contests')
    .select('id, name, divisions, events!inner(name)')
    .eq('name', 'Strictly Balboa')
    .eq('events.name', 'California Balboa Classic');
  if (cErr) throw new Error(`contest lookup: ${cErr.message}`);
  const contest = (contests ?? []).find(
    (c) => c.divisions.includes('novice') && c.divisions.includes('advanced')
  );
  if (!contest) throw new Error('CalBal contest offering novice+advanced not found');
  const CONTEST = contest.id;
  console.log(`Using contest ${contest.name} @ California Balboa Classic (${CONTEST})`);
  console.log(`  divisions: ${contest.divisions.join(', ')}\n`);

  // Clean slate, then create the four throwaways with profiles + entries.
  await deleteThrowaways();
  const P = {}; // key -> profileId
  const E = {}; // key -> entryId (what get_deck is keyed by)
  for (const u of USERS) {
    const { data: created, error: uErr } = await admin.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (uErr) throw new Error(`createUser ${u.email}: ${uErr.message}`);
    const { data: prof, error: pErr } = await admin
      .from('profiles')
      .insert({ user_id: created.user.id, display_name: `WP3 ${u.key}` })
      .select('id')
      .single();
    if (pErr) throw new Error(`profile ${u.email}: ${pErr.message}`);
    P[u.key] = prof.id;
    // Role lives on the entry now.
    const { data: entry, error: eErr } = await admin
      .from('entries')
      .insert({ profile_id: prof.id, contest_id: CONTEST, division: u.division, role: u.role })
      .select('id')
      .single();
    if (eErr) throw new Error(`entry ${u.email}: ${eErr.message}`);
    E[u.key] = entry.id;
  }

  const a = await signIn(USERS[0].email);
  const b = await signIn(USERS[1].email);

  // 1) B's deck contains A and D; excludes C (division) and B/E (role).
  //    Membership checks only — fixture/demo profiles share this contest.
  const deck1 = await deckIds(b, E.B);
  check(
    "B's deck contains A and D",
    deck1.has(P.A) && deck1.has(P.D),
    `deck=${[...deck1].length} card(s)`
  );
  check('B\'s deck EXCLUDES C (wrong division)', !deck1.has(P.C));
  check('B\'s deck EXCLUDES B and E (same role)', !deck1.has(P.B) && !deck1.has(P.E));

  // 2) A likes B -> no match yet; B still sees A (B hasn't swiped).
  const { error: aLikeErr } = await insertSwipe(a, CONTEST, P.A, 'leader', P.B, 'like');
  check('A can like B (own swipe accepted)', !aLikeErr, aLikeErr?.message);
  check('no match row after only A liked', !(await matchVisible(a, CONTEST, P.A, P.B)));
  const deck2 = await deckIds(b, E.B);
  check("B's deck STILL contains A (B hasn't swiped)", deck2.has(P.A));

  // 3) B likes A -> mutual match; both members can read it; B's deck drops A.
  const { error: bLikeErr } = await insertSwipe(b, CONTEST, P.B, 'follower', P.A, 'like');
  check('B can like A (own swipe accepted)', !bLikeErr, bLikeErr?.message);
  const seenByB = await matchVisible(b, CONTEST, P.A, P.B);
  const seenByA = await matchVisible(a, CONTEST, P.A, P.B);
  check('match row exists and BOTH A and B can select it', seenByB && seenByA);
  const deck3 = await deckIds(b, E.B);
  check("B's deck now EXCLUDES A (swiped + matched)", !deck3.has(P.A));

  // 4) B passes D -> D gone; re-calling get_deck confirms permanence.
  const { error: bPassErr } = await insertSwipe(b, CONTEST, P.B, 'follower', P.D, 'pass');
  check('B can pass D (own swipe accepted)', !bPassErr, bPassErr?.message);
  const deck4 = await deckIds(b, E.B);
  check('D gone from B\'s deck after pass', !deck4.has(P.D));
  const deck5 = await deckIds(b, E.B);
  check(
    'get_deck permanence: D still absent on re-call',
    !deck5.has(P.D) && !deck5.has(P.A)
  );

  // 5) Spoof: B inserts a swipe claiming A as the swiper -> RLS must reject.
  const { error: spoofErr } = await insertSwipe(b, CONTEST, P.A, 'leader', P.C, 'like');
  check(
    "spoof rejected: B cannot insert a swipe as A's profile",
    !!spoofErr,
    spoofErr ? spoofErr.message : 'INSERT unexpectedly SUCCEEDED'
  );

  await a.auth.signOut();
  await b.auth.signOut();
} catch (err) {
  console.error(`\nERROR: ${err.message || err}`);
  exitCode = 1;
} finally {
  await deleteThrowaways();
  console.log('\nCleaned up throwaway users.');
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length || exitCode) {
  console.error('VERIFY-WP3 FAILED');
  process.exit(1);
}
console.log('VERIFY-WP3 PASSED');
process.exit(0);
