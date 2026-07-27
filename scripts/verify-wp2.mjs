// ============================================================================
// WP2 (Events + Entries) — live-DB verification
// ============================================================================
// Exercises the real events/contests/entries flow against the LIVE Supabase
// project using the ANON client signed in as throwaway users (created via the
// service-role admin API), the same code path the app itself uses. Cleans up
// everything it creates. PASS/FAIL lines; exits non-zero on any failure.
//
// Usage:  node scripts/verify-wp2.mjs
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY   (server-only; bypasses RLS — admin + cleanup)
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

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'Verify123!';
const ALL_DIVISIONS = ['novice', 'amateur', 'advanced', 'open'];

let exitCode = 0;
function pass(name) {
  console.log(`PASS: ${name}`);
}
function fail(name, detail) {
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
  exitCode = 1;
}

const createdUserIds = [];
const createdEventIds = [];

async function createVerifyUser(label, role) {
  const email = `wp2-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@verify.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  createdUserIds.push(data.user.id);

  const { data: prof, error: pErr } = await admin
    .from('profiles')
    .insert({ user_id: data.user.id, display_name: `WP2 Verify ${label}`, role })
    .select('id')
    .single();
  if (pErr) throw new Error(`profile insert (${label}): ${pErr.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: true },
  });
  const { error: signErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signErr) throw new Error(`sign-in (${label}): ${signErr.message}`);

  return { label, email, userId: data.user.id, profileId: prof.id, client };
}

async function main() {
  const userA = await createVerifyUser('a', 'leader');
  const userB = await createVerifyUser('b', 'follower');

  // ---- get_my_profile_id() sanity (what the app itself relies on) ----
  const { data: rpcProfileId, error: rpcErr } = await userA.client.rpc('get_my_profile_id');
  if (rpcErr || rpcProfileId !== userA.profileId) {
    fail('get_my_profile_id() returns caller profile id', rpcErr?.message ?? `got ${rpcProfileId}`);
  } else {
    pass('get_my_profile_id() returns caller profile id');
  }

  // ---- 1. approved events query returns the 3 seeds with dates + urls ----
  const today = new Date().toISOString().slice(0, 10);
  const { data: events, error: evErr } = await userA.client
    .from('events')
    .select('id, name, location, start_date, end_date, website_url, facebook_url')
    .eq('status', 'approved')
    .gte('end_date', today)
    .order('start_date', { ascending: true });

  if (evErr) {
    fail('approved events query returns the 3 seeds', evErr.message);
  } else if ((events?.length ?? 0) !== 3) {
    fail('approved events query returns the 3 seeds', `expected 3 rows, got ${events?.length ?? 0}`);
  } else if (!events.every((e) => e.start_date && e.end_date)) {
    fail('approved events query returns the 3 seeds', 'a row is missing start_date/end_date');
  } else {
    pass('approved events query returns the 3 seeds with dates');
  }

  const camp = events?.find((e) => e.name === 'Camp Hollywood');
  if (!camp) {
    fail('website/facebook fields present on seeds', 'Camp Hollywood not found in results');
  } else if (!camp.website_url || !camp.facebook_url) {
    fail('website/facebook fields present on seeds', 'Camp Hollywood missing website_url/facebook_url');
  } else {
    pass('website/facebook fields present on seeds (Camp Hollywood has both)');
  }
  const rendezvous = events?.find((e) => e.name === 'Balboa Rendezvous');
  if (rendezvous && rendezvous.facebook_url === null) {
    pass('null facebook_url passes through as null (Balboa Rendezvous)');
  } else if (rendezvous) {
    fail('null facebook_url passes through as null', `expected null, got ${rendezvous.facebook_url}`);
  }

  if (!camp) throw new Error('cannot continue without the Camp Hollywood seed event');

  // ---- pick a contest that does NOT offer all 4 divisions, so we have a
  //      guaranteed-invalid division to test the trigger with ----
  const { data: contests, error: cErr } = await userA.client
    .from('contests')
    .select('id, name, divisions, event_id')
    .eq('event_id', camp.id)
    .order('name', { ascending: true });
  if (cErr || !contests?.length) {
    throw new Error(`fetch contests for Camp Hollywood: ${cErr?.message ?? 'no contests returned'}`);
  }
  const targetContest = contests.find((c) => c.divisions.length < ALL_DIVISIONS.length) ?? contests[0];
  const validDivision = targetContest.divisions[0];
  const invalidDivision = ALL_DIVISIONS.find((d) => !targetContest.divisions.includes(d));

  // ---- 2. join: entry insert with a division from contest.divisions succeeds ----
  const { error: joinErr } = await userA.client.from('entries').insert({
    profile_id: userA.profileId,
    contest_id: targetContest.id,
    division: validDivision,
    note: 'wp2 verify note',
  });
  if (joinErr) {
    fail('join contest with a division from contest.divisions', joinErr.message);
  } else {
    pass(`join contest with a division from contest.divisions succeeds (${targetContest.name} / ${validDivision})`);
  }

  // ---- 3. duplicate join -> 23505 ----
  const { error: dupErr } = await userA.client.from('entries').insert({
    profile_id: userA.profileId,
    contest_id: targetContest.id,
    division: validDivision,
    note: 'dup attempt',
  });
  if (dupErr?.code === '23505') {
    pass('duplicate join is rejected with error code 23505');
  } else {
    fail('duplicate join is rejected with error code 23505', `got ${JSON.stringify(dupErr)}`);
  }

  // ---- 4. a division NOT offered by the contest is rejected (trigger) ----
  if (!invalidDivision) {
    fail('division not offered by contest is rejected', 'could not find a division excluded by any Camp Hollywood contest');
  } else {
    const { error: badDivErr } = await userB.client.from('entries').insert({
      profile_id: userB.profileId,
      contest_id: targetContest.id,
      division: invalidDivision,
      note: null,
    });
    if (badDivErr) {
      pass(`division not offered by contest is rejected (${targetContest.name} does not offer ${invalidDivision})`);
    } else {
      fail('division not offered by contest is rejected', 'insert unexpectedly succeeded');
      // clean up the bad entry if it somehow landed
      await admin.from('entries').delete().eq('profile_id', userB.profileId).eq('contest_id', targetContest.id);
    }
  }

  // ---- 5a. a client trying to force status='approved' cannot land an approved row ----
  const { data: malicious, error: maliciousErr } = await userA.client
    .from('events')
    .insert({
      name: 'WP2 Verify Malicious Event',
      location: 'Nowhere',
      start_date: '2027-01-01',
      end_date: '2027-01-02',
      status: 'approved',
      suggested_by: userA.userId,
    })
    .select('id, status')
    .maybeSingle();
  if (maliciousErr) {
    pass('insert explicitly requesting status=approved is rejected by RLS');
  } else {
    fail(
      'insert explicitly requesting status=approved is rejected by RLS',
      `insert succeeded with status=${malicious?.status}`
    );
    if (malicious?.id) createdEventIds.push(malicious.id);
  }

  // ---- 5b. suggest event (the real app path: no status field sent) lands pending ----
  const { data: suggested, error: suggestErr } = await userA.client
    .from('events')
    .insert({
      name: 'WP2 Verify Suggested Event',
      location: 'Nowhere',
      start_date: '2027-01-01',
      end_date: '2027-01-02',
      suggested_by: userA.userId,
    })
    .select('id, status')
    .single();

  if (suggestErr) {
    fail('suggest event lands with status pending', suggestErr.message);
  } else if (suggested.status !== 'pending') {
    fail('suggest event lands with status pending', `got status=${suggested.status}`);
  } else {
    pass('suggest event lands with status pending');
    createdEventIds.push(suggested.id);
  }

  // ---- 6. a second user cannot see that pending event; the suggester can ----
  if (suggestErr) {
    fail('pending event visibility check skipped', 'suggest insert failed above');
  } else {
    const { data: seenByB } = await userB.client
      .from('events')
      .select('id')
      .eq('id', suggested.id)
      .maybeSingle();
    if (seenByB) {
      fail('second throwaway user cannot see the pending event', 'row was visible to userB');
    } else {
      pass('second throwaway user cannot see the pending event');
    }

    const { data: seenByA } = await userA.client
      .from('events')
      .select('id')
      .eq('id', suggested.id)
      .maybeSingle();
    if (!seenByA) {
      fail('the suggester can see their own pending event', 'row was NOT visible to userA');
    } else {
      pass('the suggester can see their own pending event');
    }

    // Also confirm the pending event does not leak into the public/approved list.
    const { data: publicList } = await userB.client
      .from('events')
      .select('id')
      .eq('status', 'approved')
      .gte('end_date', today);
    if (publicList?.some((e) => e.id === suggested.id)) {
      fail('pending event excluded from the approved public list', 'unexpectedly present');
    } else {
      pass('pending event excluded from the approved public list');
    }
  }
}

try {
  await main();
} catch (err) {
  fail('unexpected error during verification', err?.message ?? String(err));
} finally {
  // ---- cleanup: delete suggested/malicious events (service role) + both users ----
  for (const id of createdEventIds) {
    const { error } = await admin.from('events').delete().eq('id', id);
    if (error) fail(`cleanup: delete event ${id}`, error.message);
    else pass(`cleanup: deleted event ${id}`);
  }
  for (const id of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) fail(`cleanup: delete user ${id}`, error.message);
    else pass(`cleanup: deleted user ${id}`);
  }
}

process.exit(exitCode);
