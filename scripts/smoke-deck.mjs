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

const { data: deck, error: dErr } = await supabase.rpc('get_deck', {
  p_contest_id: contests[0].id,
});
if (dErr) fail(`get_deck: ${dErr.message}`);

const names = (deck ?? []).map((d) => d.display_name).sort();
console.log('deck for follower1:', names);

// Membership assertions, not exact counts — demo dancers share this contest.
const hasLeo = names.includes('Leo Leader');
const allNovice = (deck ?? []).every((d) => d.division === 'novice');
if (!hasLeo) fail('fixture leader "Leo Leader" missing from the deck');
if (!allNovice) fail('deck contains a non-novice candidate');

console.log(`SMOKE PASSED: fixture leader present, all ${names.length} candidates novice.`);
await supabase.auth.signOut();
