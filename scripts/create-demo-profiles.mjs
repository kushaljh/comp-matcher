// Seeds 10 demo dancers (5 leaders + 5 followers) and enters each of them in
// EVERY approved contest, spreading them round-robin across each contest's
// divisions so every (contest, division, role) combination has at least one
// candidate to swipe on. Idempotent: safe to re-run.
//
// DB rule worth knowing: entries are UNIQUE(profile_id, contest_id) — one
// division per contest per profile — which is why the same 5 people per role
// are spread across divisions rather than appearing in all of them.
//
// Usage: node scripts/create-demo-profiles.mjs   (needs .env service role key)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
}

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PASSWORD = 'Demo123!';
const DEMO = [
  { email: 'demo-leader1@demo.test', role: 'leader', name: 'Dean Rockwell', values: ['winning', 'improving'], bio: 'Counts in his sleep. Looking for a partner who drills.', history: [{ event_name: 'Camp Hollywood', year: 2024, contest_name: 'Strictly Lindy', placement: '2nd' }] },
  { email: 'demo-leader2@demo.test', role: 'leader', name: 'Frankie Silva', values: ['social fun', 'yolo'], bio: 'Here for the joy, stays for the finals.', history: [{ event_name: 'Balboa Rendezvous', year: 2025, contest_name: 'Strictly Balboa', placement: 'Finalist' }] },
  { email: 'demo-leader3@demo.test', role: 'leader', name: 'Marco Ellington', values: ['exposure', 'winning'], bio: 'Musicality first, flash second.', history: [] },
  { email: 'demo-leader4@demo.test', role: 'leader', name: 'Satchmo Kline', values: ['making friends', 'social fun'], bio: 'Will trade balboa tips for good playlists.', history: [{ event_name: 'California Balboa Classic', year: 2025, contest_name: 'Amateur Strictly', placement: null }] },
  { email: 'demo-leader5@demo.test', role: 'leader', name: 'Ray Whitfield', values: ['yolo'], bio: 'First comp season. Zero fear.', history: [] },
  { email: 'demo-follower1@demo.test', role: 'follower', name: 'Norma Deluxe', values: ['winning', 'exposure'], bio: 'Swivels that stop traffic. Serious inquiries only.', history: [{ event_name: 'Camp Hollywood', year: 2023, contest_name: 'Strictly Lindy', placement: '1st' }] },
  { email: 'demo-follower2@demo.test', role: 'follower', name: 'Jean Laverne', values: ['social fun', 'making friends'], bio: 'Competing is just social dancing with witnesses.', history: [] },
  { email: 'demo-follower3@demo.test', role: 'follower', name: 'Dawn Okafor', values: ['improving', 'winning'], bio: 'Practice partner turned podium hunter.', history: [{ event_name: 'Balboa Rendezvous', year: 2025, contest_name: 'Strictly Balboa', placement: '3rd' }] },
  { email: 'demo-follower4@demo.test', role: 'follower', name: 'Vera Castellano', values: ['yolo', 'social fun'], bio: 'Will follow anything once.', history: [] },
  { email: 'demo-follower5@demo.test', role: 'follower', name: 'Pearl Jackson', values: ['exposure'], bio: 'Building a comp reel one strictly at a time.', history: [] },
];

const { data: contests, error: cErr } = await admin
  .from('contests')
  .select('id, name, divisions, events!inner(name, status)')
  .eq('events.status', 'approved');
if (cErr) throw cErr;
console.log(`${contests.length} approved contests found`);

let created = 0, existing = 0, entriesUpserted = 0;
for (const [idx, d] of DEMO.entries()) {
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list.users.find((u) => u.email === d.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: d.email, password: PASSWORD, email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    created++;
  } else existing++;

  let { data: prof } = await admin.from('profiles').select('id').eq('user_id', user.id).maybeSingle();
  if (!prof) {
    const { data, error } = await admin
      .from('profiles')
      .insert({ user_id: user.id, display_name: d.name, bio: d.bio, values: d.values })
      .select('id')
      .single();
    if (error) throw error;
    prof = data;
    await admin.from('profile_contacts').insert([
      { profile_id: prof.id, platform: 'instagram', handle: d.name.toLowerCase().replace(/\s+/g, '.') },
      { profile_id: prof.id, platform: 'email', handle: d.email },
    ]);
    if (d.history.length) {
      await admin.from('competition_history').insert(d.history.map((h) => ({ ...h, profile_id: prof.id })));
    }
  }

  // Enter every approved contest; round-robin the division per profile index
  // so each contest's divisions all end up populated for both roles.
  for (const c of contests) {
    const division = c.divisions[idx % 5 % c.divisions.length];
    const { error } = await admin
      .from('entries')
      .upsert(
        { profile_id: prof.id, contest_id: c.id, division, role: d.role, note: 'Demo dancer — say hi!' },
        { onConflict: 'profile_id,contest_id,role' }
      );
    if (error) throw error;
    entriesUpserted++;
  }
}

console.log(`demo users: ${created} created, ${existing} already existed`);
console.log(`entries upserted: ${entriesUpserted}`);

// Coverage report: any (contest, division, role) combos with no demo candidate?
const gaps = [];
for (const c of contests) {
  for (const div of c.divisions) {
    for (const role of ['leader', 'follower']) {
      const covered = DEMO.some((d, idx) => d.role === role && c.divisions[idx % 5 % c.divisions.length] === div);
      if (!covered) gaps.push(`${c.events.name} / ${c.name} / ${div} / ${role}`);
    }
  }
}
console.log(gaps.length ? `COVERAGE GAPS:\n  ${gaps.join('\n  ')}` : 'Full coverage: every contest/division/role has at least one demo dancer.');
