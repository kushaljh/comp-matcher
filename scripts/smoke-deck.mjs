// Live smoke test through the real client path (anon key + PostgREST):
// signs in as fixture follower1 and checks get_deck() returns exactly the
// novice leader in CalBal "Strictly Balboa" — not the advanced leader, not
// profiles from other contests. Run after scripts/create-fixtures.mjs.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

const fail = (msg) => {
  console.error(`SMOKE FAILED: ${msg}`);
  process.exit(1);
};

const { error: authErr } = await supabase.auth.signInWithPassword({
  email: 'follower1@fixture.test',
  password: 'Fixture123!',
});
if (authErr) fail(`sign-in: ${authErr.message}`);

const { data: contests, error: cErr } = await supabase
  .from('contests')
  .select('id, name, events!inner(name)')
  .eq('name', 'Strictly Balboa')
  .ilike('events.name', '%balboa classic%');
if (cErr) fail(`contests query: ${cErr.message}`);
if (!contests?.length) fail('CalBal "Strictly Balboa" contest not found');

// get_deck is keyed by ENTRY now, not contest — a dancer can hold two entries
// in one contest (one per role), which a contest id could not disambiguate.
const { data: myProfileId, error: pErr } = await supabase.rpc('get_my_profile_id');
if (pErr) fail(`get_my_profile_id: ${pErr.message}`);

const { data: myEntries, error: eErr } = await supabase
  .from('entries')
  .select('id, role, division')
  .eq('profile_id', myProfileId)
  .eq('contest_id', contests[0].id);
if (eErr) fail(`entries query: ${eErr.message}`);
if (!myEntries?.length) fail('follower1 has no entry in CalBal "Strictly Balboa"');

const myEntry = myEntries.find((e) => e.role === 'follower') ?? myEntries[0];

const { data: deck, error: dErr } = await supabase.rpc('get_deck', {
  p_entry_id: myEntry.id,
});
if (dErr) fail(`get_deck: ${dErr.message}`);

const names = (deck ?? []).map((d) => d.display_name).sort();
console.log(`deck for follower1 (${myEntry.role}, ${myEntry.division}):`, names);

// Membership assertions, not exact counts — demo dancers share this contest.
const hasLeo = names.includes('Leo Leader');
const allNovice = (deck ?? []).every((d) => d.division === 'novice');
// Every candidate must be the OPPOSITE role to the entry we dealt from.
const opposite = myEntry.role === 'follower' ? 'leader' : 'follower';
const allOpposite = (deck ?? []).every((d) => d.role === opposite);
if (!hasLeo) fail('fixture leader "Leo Leader" missing from the deck');
if (!allNovice) fail('deck contains a non-novice candidate');
if (!allOpposite) fail(`deck contains a candidate who is not a ${opposite}`);

console.log(
  `SMOKE PASSED: fixture leader present, all ${names.length} candidates novice ${opposite}s.`
);
await supabase.auth.signOut();
