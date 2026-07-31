// ============================================================================
// Comp Matcher — invite-only live verification
// ============================================================================
// Proves the invite gate against the LIVE hosted Supabase project using the
// ANON client, so RLS and the before_user_created hook are actually exercised
// rather than bypassed. Asserts, in order:
//
//   1. signUp WITHOUT a code is rejected      (hook; requires the hook to be
//                                              enabled in the dashboard — the
//                                              script says so if it is not)
//   2. signUp with a bogus code is rejected   (hook)
//   3. signUp with a real code succeeds, the code is consumed, and the new
//      user has an app_members row            (auth.users trigger)
//   4. that same code cannot be reused        (single-use)
//   5. a member's 4th create_invite() is refused (quota)
//   6. an uninvited session cannot insert a profile (profiles_insert — the
//      gate that holds even with the hook off)
//
// Everything it creates is deleted at the end.
//
// Usage: node scripts/verify-invites.mjs   (run from the worktree root)
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY   (server-only; bypasses RLS — used to mint the
//                                seed code and to delete the throwaway users)
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env is optional if vars are already in the environment */ }

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error(
    'Missing EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY (set them in .env or the environment).'
  );
  process.exit(1);
}

const clientOpts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts);
const anon = createClient(SUPABASE_URL, ANON_KEY, clientOpts);

const PASSWORD = 'InviteVerify123!';
const stamp = Date.now();
const EMAIL_INVITER = `invite-verify-host-${stamp}@verify.test`;
const EMAIL_GUEST = `invite-verify-guest-${stamp}@verify.test`;
const EMAIL_NOCODE = `invite-verify-nocode-${stamp}@verify.test`;
const EMAIL_BADCODE = `invite-verify-badcode-${stamp}@verify.test`;

const created = [];   // user ids to clean up
let hookEnabled = true;

function pass(label) { console.log(`  ✓ ${label}`); }
function fail(label, detail) {
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}

async function cleanup() {
  for (const id of created) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await admin.from('invites').delete().like('code', 'VERIFY%');
}

try {
  console.log('Invite-only verification\n');

  // --- setup: an inviter (created service-side, so no code needed) ---------
  const { data: inviterData, error: inviterErr } = await admin.auth.admin.createUser({
    email: EMAIL_INVITER,
    password: PASSWORD,
    email_confirm: true,
  });
  if (inviterErr) throw inviterErr;
  created.push(inviterData.user.id);

  // The trigger's codeless branch should have made them a member already.
  const { data: memberRow } = await admin
    .from('app_members')
    .select('user_id')
    .eq('user_id', inviterData.user.id)
    .maybeSingle();
  if (memberRow) pass('service-role user creation still works and grants membership');
  else fail('service-role user creation did not grant membership');

  // --- 1. codeless signup is rejected --------------------------------------
  const { error: noCodeErr } = await anon.auth.signUp({
    email: EMAIL_NOCODE,
    password: PASSWORD,
    options: { data: { invite_code: '' } },
  });
  if (noCodeErr) {
    pass(`signup with no code rejected (${noCodeErr.message})`);
  } else {
    hookEnabled = false;
    const { data: leaked } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const u = leaked.users.find((x) => x.email === EMAIL_NOCODE);
    if (u) created.push(u.id);
    fail(
      'signup with no code was ALLOWED',
      'the before_user_created hook is not enabled — turn it on in Dashboard → Authentication → Hooks (pg-functions://postgres/public/hook_require_invite)'
    );
  }

  // --- 2. bogus code is rejected -------------------------------------------
  const { error: badCodeErr } = await anon.auth.signUp({
    email: EMAIL_BADCODE,
    password: PASSWORD,
    options: { data: { invite_code: 'NOTAREALCODE' } },
  });
  if (badCodeErr) pass('signup with an unknown code rejected');
  else {
    const { data: leaked } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const u = leaked.users.find((x) => x.email === EMAIL_BADCODE);
    if (u) created.push(u.id);
    fail('signup with an unknown code was ALLOWED');
  }

  // --- 3. a real code lets exactly one person in ---------------------------
  const CODE = `VERIFY${stamp}`.slice(0, 12).toUpperCase();
  const { error: seedErr } = await admin
    .from('invites')
    .insert({ code: CODE, created_by: inviterData.user.id });
  if (seedErr) throw seedErr;

  const { data: guestData, error: guestErr } = await anon.auth.signUp({
    email: EMAIL_GUEST,
    password: PASSWORD,
    options: { data: { invite_code: CODE.toLowerCase() } },   // also tests normalisation
  });
  if (guestErr) {
    fail('signup with a valid code was rejected', guestErr.message);
  } else {
    created.push(guestData.user.id);
    pass('signup with a valid code succeeded (lower-case code matched)');

    const { data: consumed } = await admin
      .from('invites')
      .select('redeemed_by, redeemed_at')
      .eq('code', CODE)
      .single();
    if (consumed?.redeemed_by === guestData.user.id && consumed.redeemed_at) {
      pass('the code was consumed by the new user');
    } else {
      fail('the code was not marked redeemed by the new user');
    }

    const { data: guestMember } = await admin
      .from('app_members')
      .select('user_id, invited_by')
      .eq('user_id', guestData.user.id)
      .maybeSingle();
    if (guestMember?.invited_by === inviterData.user.id) {
      pass('membership recorded, attributed to the inviter');
    } else {
      fail('membership row missing or not attributed to the inviter');
    }
  }

  // --- 4. the code cannot be reused ----------------------------------------
  const { error: reuseErr } = await anon.auth.signUp({
    email: `invite-verify-reuse-${stamp}@verify.test`,
    password: PASSWORD,
    options: { data: { invite_code: CODE } },
  });
  if (reuseErr) pass('a consumed code cannot be reused');
  else fail('a consumed code was accepted a second time');

  // --- 5. the quota stops the 4th code -------------------------------------
  const guestSession = createClient(SUPABASE_URL, ANON_KEY, clientOpts);
  const { error: signInErr } = await guestSession.auth.signInWithPassword({
    email: EMAIL_GUEST,
    password: PASSWORD,
  });
  if (signInErr) {
    console.log(`  · skipping quota check (guest could not sign in: ${signInErr.message})`);
  } else {
    let quotaBlocked = false;
    for (let i = 0; i < 4; i++) {
      const { error } = await guestSession.rpc('create_invite');
      if (error) { quotaBlocked = i === 3; break; }
    }
    if (quotaBlocked) pass('create_invite() refuses the 4th code (quota of 3)');
    else fail('create_invite() did not enforce the quota');

    const { data: remaining } = await guestSession.rpc('my_invites_remaining');
    if (remaining === 0) pass('my_invites_remaining() reports 0 left');
    else fail(`my_invites_remaining() reported ${remaining}, expected 0`);
  }

  // --- 6. an uninvited session cannot create a profile ---------------------
  // Strip the guest's membership to simulate a session that never had one:
  // this is the gate that holds even if the hook is off.
  await admin.from('app_members').delete().eq('user_id', guestData?.user.id ?? '');
  if (!signInErr) {
    const { error: profileErr } = await guestSession
      .from('profiles')
      .insert({ user_id: guestData.user.id, display_name: 'Should not exist' });
    if (profileErr) pass('an uninvited session cannot insert a profile (RLS)');
    else fail('an uninvited session created a profile — profiles_insert is not gating');
  }

  console.log(
    process.exitCode === 1
      ? '\nSome checks FAILED.'
      : `\nAll invite checks passed${hookEnabled ? '' : ' (hook disabled)'}.`
  );
} catch (err) {
  console.error(`\nVerification error: ${err.message || err}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
