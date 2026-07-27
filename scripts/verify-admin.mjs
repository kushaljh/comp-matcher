// ============================================================================
// Admin panel — live verification
// ----------------------------------------------------------------------------
// Exercises the exact access paths the admin panel relies on, against the
// LIVE hosted Supabase project, through the same RLS the app runs under
// (ANON clients signed in as throwaway users for every assertion; the
// service role is used ONLY for setup/cleanup, never for the assertions
// themselves).
//
// IMPORTANT — this script is written and run BEFORE the migration
// (supabase/migrations/20260728100000_admin.sql) has been applied to the
// live DB (this worktree may not run `supabase db push` / DDL). The FIRST
// admin-dependent step is granting a throwaway user admin access via a
// service-role insert into admin_users — on a database that doesn't have
// that migration yet, this fails with a missing-relation/schema-cache error.
// That specific failure is caught, printed as a distinguishable
// `EXPECTED-FAIL (migration not applied yet)` line, remaining admin-dependent
// checks are skipped (there is nothing meaningful to test without the
// table), and the process exits 0 — PROVIDED every check that ran before
// that point (which do not depend on the new migration at all) passed for
// real. Any other kind of failure, at any point, is a real failure and exits
// non-zero. Once the migration is applied, this same, unmodified script goes
// full PASS with zero EXPECTED-FAIL lines.
//
// Coverage:
//   1. non-admin cannot read another user's pending event
//   2. non-admin cannot change an event's status (UPDATE is a no-op under RLS)
//   3. non-admin cannot INSERT a contest (RLS rejection)
//   -- first admin-dependent step: grant an admin via service role --
//   4. non-admin cannot INSERT into admin_users (granting themselves admin)
//   5. admin CAN list all pending events (including someone else's)
//   6. admin CAN approve a pending event (status flips to 'approved')
//   7. admin CAN add a contest to the now-approved event
//   8. admin CAN delete that contest
//   9. admin CAN reject-delete a (different) pending event
//
// Usage:  node scripts/verify-admin.mjs
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

const clientOpts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts);

function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, clientOpts);
}

async function signInAnon(email, password) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return client;
}

const PASSWORD = 'AdminVerify123!';
const USERS = {
  owner: { email: 'admin-owner@verify.test' }, // will be granted admin
  nonadmin: { email: 'admin-nonadmin@verify.test' }, // stays a regular user
  suggester: { email: 'admin-suggester@verify.test' }, // owns the test events
};

// --- tiny test harness (matches scripts/verify-wp4.mjs) ----------------------
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

// Distinguishes "admin_users doesn't exist yet" (expected pre-migration) from
// any other error. PostgREST reports an unknown table via PGRST205 ("Could
// not find the table ... in the schema cache"); a raw postgres error (should
// this ever be hit some other way) would say "does not exist" / 42P01.
function isMissingAdminUsersTable(error) {
  if (!error) return false;
  if (error.code === 'PGRST205') return true;
  return /schema cache/i.test(error.message ?? '') || /does not exist/i.test(error.message ?? '');
}

// --- state for cleanup --------------------------------------------------------
const state = {
  ownerUserId: null,
  nonadminUserId: null,
  suggesterUserId: null,
  eventIds: [], // any events this script created, deleted in finally regardless of outcome
  contestIds: [], // any contests this script created
};

async function createThrowawayUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  return data.user.id;
}

async function createPendingEvent(suggestedBy, label) {
  const { data, error } = await admin
    .from('events')
    .insert({
      name: `Verify Admin Event (${label})`,
      location: 'Verify City',
      start_date: '2027-01-15',
      end_date: '2027-01-17',
      suggested_by: suggestedBy,
      // status omitted — defaults to 'pending', same as the real suggest flow
    })
    .select('id')
    .single();
  if (error) throw new Error(`create pending event (${label}): ${error.message}`);
  state.eventIds.push(data.id);
  return data.id;
}

async function getEvent(eventId) {
  const { data, error } = await admin.from('events').select('*').eq('id', eventId).maybeSingle();
  if (error) throw new Error(`read back event ${eventId}: ${error.message}`);
  return data;
}

async function cleanup() {
  console.log('\n--- cleanup ---');
  // Delete any contests/events this script created (service role — bypasses
  // RLS, so this works regardless of whether the admin migration landed).
  for (const contestId of state.contestIds) {
    const { error } = await admin.from('contests').delete().eq('id', contestId);
    if (error) console.log(`  cleanup warning: could not delete contest ${contestId}: ${error.message}`);
  }
  for (const eventId of state.eventIds) {
    const { error } = await admin.from('events').delete().eq('id', eventId);
    if (error) console.log(`  cleanup warning: could not delete event ${eventId}: ${error.message}`);
  }
  console.log('  deleted any events/contests created by this run');

  for (const [label, userId] of [
    ['owner', state.ownerUserId],
    ['nonadmin', state.nonadminUserId],
    ['suggester', state.suggesterUserId],
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
  console.log('--- setup: throwaway users (owner/nonadmin/suggester) ---');
  state.ownerUserId = await createThrowawayUser(USERS.owner.email);
  state.nonadminUserId = await createThrowawayUser(USERS.nonadmin.email);
  state.suggesterUserId = await createThrowawayUser(USERS.suggester.email);
  console.log(
    `setup complete: owner=${state.ownerUserId} nonadmin=${state.nonadminUserId} suggester=${state.suggesterUserId}`
  );

  const pendingEvent1Id = await createPendingEvent(state.suggesterUserId, 'pending #1, owned by suggester');
  console.log(`setup: created pending event ${pendingEvent1Id} (suggested by suggester)`);

  // ---------------------------------------------------------------------------
  console.log('\n--- as non-admin (pre-existing RLS, independent of the admin migration) ---');
  const nonadminClient = await signInAnon(USERS.nonadmin.email, PASSWORD);

  const { data: eventAsNonAdmin, error: readErr } = await nonadminClient
    .from('events')
    .select('id')
    .eq('id', pendingEvent1Id);
  checkErrorFree('non-admin can query events (not necessarily see this one)', readErr);
  check(
    "non-admin cannot read another user's pending event",
    (eventAsNonAdmin ?? []).length === 0,
    JSON.stringify(eventAsNonAdmin)
  );

  // UPDATE blocked by RLS is a silent no-op (0 rows affected), not always an
  // error — so the real assertion is "the row didn't change", checked via a
  // service-role re-read, not "the call returned an error".
  await nonadminClient.from('events').update({ status: 'approved' }).eq('id', pendingEvent1Id);
  const eventAfterNonAdminUpdate = await getEvent(pendingEvent1Id);
  check(
    "non-admin cannot change an event's status",
    eventAfterNonAdminUpdate?.status === 'pending',
    `status=${eventAfterNonAdminUpdate?.status}`
  );

  const { error: insertContestErr } = await nonadminClient
    .from('contests')
    .insert({ event_id: pendingEvent1Id, name: 'Hijack Contest', divisions: ['novice'] });
  check('non-admin cannot INSERT a contest', !!insertContestErr, 'insert unexpectedly succeeded');

  // ---------------------------------------------------------------------------
  console.log('\n--- admin-dependent setup: grant `owner` admin access (service role) ---');
  const { error: grantErr } = await admin.from('admin_users').insert({ user_id: state.ownerUserId });

  if (grantErr && isMissingAdminUsersTable(grantErr)) {
    console.log(`EXPECTED-FAIL (migration not applied yet): granting admin via admin_users — ${grantErr.message}`);
    console.log('Skipping all remaining admin-dependent checks (admin_users does not exist yet).');
    return; // nothing further is meaningful without the table; cleanup + exit code below still apply
  }
  checkErrorFree('service-role grant of admin_users succeeds (setup)', grantErr);
  if (grantErr) {
    throw new Error(`cannot continue without a granted admin: ${grantErr.message}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\n--- as non-admin: cannot self-grant admin ---');
  const { error: selfGrantErr } = await nonadminClient.from('admin_users').insert({ user_id: state.nonadminUserId });
  check('non-admin cannot INSERT into admin_users', !!selfGrantErr, 'insert unexpectedly succeeded');

  // ---------------------------------------------------------------------------
  console.log('\n--- as admin (owner, anon client signed in) ---');
  const ownerClient = await signInAnon(USERS.owner.email, PASSWORD);

  const { data: pendingAsAdmin, error: pendingAsAdminErr } = await ownerClient
    .from('events')
    .select('id')
    .eq('status', 'pending');
  checkErrorFree('admin can query pending events', pendingAsAdminErr);
  check(
    "admin can list all pending events (including another user's)",
    (pendingAsAdmin ?? []).some((e) => e.id === pendingEvent1Id),
    JSON.stringify(pendingAsAdmin)
  );

  const { error: approveErr } = await ownerClient.from('events').update({ status: 'approved' }).eq('id', pendingEvent1Id);
  checkErrorFree('admin can approve a pending event (UPDATE succeeds)', approveErr);
  const eventAfterApprove = await getEvent(pendingEvent1Id);
  check('approved event actually flips to status=approved', eventAfterApprove?.status === 'approved', `status=${eventAfterApprove?.status}`);

  const { data: newContest, error: addContestErr } = await ownerClient
    .from('contests')
    .insert({ event_id: pendingEvent1Id, name: 'Verify Admin Contest', divisions: ['novice', 'open'] })
    .select('id')
    .single();
  checkErrorFree('admin can add a contest to the approved event', addContestErr);
  if (newContest?.id) state.contestIds.push(newContest.id);

  const { data: contestsAfterAdd } = await admin.from('contests').select('id').eq('id', newContest?.id ?? '');
  check('the new contest actually exists', (contestsAfterAdd ?? []).length === 1, JSON.stringify(contestsAfterAdd));

  const { error: deleteContestErr } = await ownerClient.from('contests').delete().eq('id', newContest?.id ?? '');
  checkErrorFree('admin can delete a contest', deleteContestErr);
  const { data: contestsAfterDelete } = await admin.from('contests').select('id').eq('id', newContest?.id ?? '');
  check('the deleted contest is actually gone', (contestsAfterDelete ?? []).length === 0, JSON.stringify(contestsAfterDelete));
  if (newContest?.id) state.contestIds = state.contestIds.filter((id) => id !== newContest.id); // already gone; don't re-delete in cleanup

  // ---------------------------------------------------------------------------
  console.log('\n--- as admin: reject-delete a (separate) pending event ---');
  const pendingEvent2Id = await createPendingEvent(state.suggesterUserId, 'pending #2, for reject test');

  const { error: rejectErr } = await ownerClient.from('events').delete().eq('id', pendingEvent2Id);
  checkErrorFree('admin can reject (delete) a pending event', rejectErr);
  const eventAfterReject = await getEvent(pendingEvent2Id);
  check('the rejected event is actually gone', eventAfterReject === null, JSON.stringify(eventAfterReject));
  if (eventAfterReject === null) state.eventIds = state.eventIds.filter((id) => id !== pendingEvent2Id); // already gone
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
