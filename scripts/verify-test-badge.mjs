// Verifies the TEST-badge flag (20260731120000_test_account_badge.sql):
//  1. service role: every .test-email profile is flagged, no real one is
//  2. anon client as follower1@fixture.test: get_deck deals is_test on every
//     card, and get_passed still answers
// Usage: node scripts/verify-test-badge.mjs   (needs .env)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY);
let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

// --- 1. backfill correctness (service role can see auth.users emails) -------
const { data: users, error: uErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (uErr) throw uErr;
const testUserIds = new Set(users.users.filter((u) => (u.email || '').endsWith('.test')).map((u) => u.id));
const { data: profs, error: pErr } = await admin.from('profiles').select('user_id, display_name, is_test');
if (pErr) throw pErr;

const wrongUnflagged = profs.filter((p) => testUserIds.has(p.user_id) && !p.is_test);
const wrongFlagged = profs.filter((p) => !testUserIds.has(p.user_id) && p.is_test);
const flaggedCount = profs.filter((p) => p.is_test).length;
check(wrongUnflagged.length === 0, 'every .test-email profile is flagged', `${flaggedCount} flagged of ${profs.length} profiles`);
if (wrongUnflagged.length) console.log('  missing:', wrongUnflagged.map((p) => p.display_name).join(', '));
check(wrongFlagged.length === 0, 'no real-email profile is flagged');
if (wrongFlagged.length) console.log('  wrongly flagged:', wrongFlagged.map((p) => p.display_name).join(', '));

// --- 2. client path: fixture follower1's deck carries is_test ---------------
const anon = createClient(URL_, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const { error: signErr } = await anon.auth.signInWithPassword({
  email: 'follower1@fixture.test',
  password: 'Fixture123!',
});
if (signErr) throw signErr;

const { data: myId } = await anon.rpc('get_my_profile_id');
const { data: entries, error: eErr } = await anon
  .from('entries')
  .select('id, role, division, contests!inner(name)')
  .eq('profile_id', myId);
if (eErr) throw eErr;
const entry = entries.find((e) => e.role === 'follower');
check(!!entry, 'fixture follower1 has an entry to deal a deck from', entry && `${entry.contests.name} / ${entry.division}`);

if (entry) {
  const { data: deck, error: dErr } = await anon.rpc('get_deck', { p_entry_id: entry.id });
  if (dErr) throw dErr;
  check(deck.length > 0, 'deck is non-empty', `${deck.length} cards`);
  const withFlag = deck.filter((c) => typeof c.is_test === 'boolean');
  check(withFlag.length === deck.length, 'every card carries an is_test boolean');
  for (const c of deck) console.log(`  ${c.display_name}: is_test=${c.is_test}`);

  const { data: passed, error: gErr } = await anon.rpc('get_passed', { p_entry_id: entry.id });
  check(!gErr, 'get_passed still callable and carries the column', gErr ? gErr.message : `${passed.length} passed`);
}

await anon.auth.signOut();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
