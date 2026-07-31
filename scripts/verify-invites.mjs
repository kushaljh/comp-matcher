// ============================================================================
// Comp Matcher — invite-only live verification (over HTTP)
// ============================================================================
// supabase/tests/rls_tests.sql covers the database half of the invite flow
// thoroughly, and it does so by inserting into auth.users with the metadata
// shape GoTrue writes. Two things it CANNOT reach, and this script exists for:
//
//   1. That a real supabase.auth.signUp() actually carries options.data
//      through to user_metadata, where hook_require_invite() reads it. Every
//      SQL test assumes this; only an HTTP signup proves it.
//   2. That the before_user_created hook is actually WIRED UP on the hosted
//      project. It is a dashboard setting, invisible to both the repo and the
//      database. If it is off, check 2 below fails loudly and tells you so.
//
// Everything runs against the LIVE project through the ANON client, so RLS and
// the auth server are genuinely in the path. Throwaway accounts are created
// under @verify.test and deleted at the end.
//
// Usage: node scripts/verify-invites.mjs   (run from the worktree root)
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY   (server-only; bypasses RLS — used to seed the
//                                 codes and to delete the throwaway accounts)
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
const anon = () => createClient(SUPABASE_URL, ANON_KEY, clientOpts);

const PASSWORD = 'InviteVerify123!';
const stamp = Date.now();
const email = (who) => `invite-verify-${who}-${stamp}@verify.test`;

const createdUsers = [];
let failures = 0;

function pass(label) { console.log(`  ✓ ${label}`); }
function fail(label, detail) {
  failures++;
  console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

async function seedCode(code, ownerId, extra = {}) {
  const { error } = await admin.from('invites').insert({ code, created_by: ownerId, ...extra });
  if (error) throw error;
  return code;
}

// signUp leaves an auth user behind even on some failures; track whatever
// exists under this run's stamp so cleanup catches it either way.
async function trackByEmail(addr) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = data?.users?.find((u) => u.email === addr);
  if (found && !createdUsers.includes(found.id)) createdUsers.push(found.id);
  return found ?? null;
}

async function cleanup() {
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id).catch(() => {});
  await admin.from('invites').delete().like('code', `VFY${stamp}%`).catch(() => {});
  await admin.from('invites').delete().like('code', 'VFY%').catch(() => {});
}

try {
  console.log('\nInvite-only verification (live, over HTTP)\n');

  // --- host account, created service-side (the codeless path) --------------
  const { data: hostData, error: hostErr } = await admin.auth.admin.createUser({
    email: email('host'), password: PASSWORD, email_confirm: true,
  });
  if (hostErr) throw hostErr;
  createdUsers.push(hostData.user.id);

  const { data: hostMember } = await admin
    .from('app_members').select('user_id, invite_quota')
    .eq('user_id', hostData.user.id).maybeSingle();
  if (hostMember) pass('service-role user creation still works, and grants membership');
  else fail('service-role user creation did not grant membership',
            'the auth.users trigger’s codeless branch is what keeps the fixture scripts working');
  if (hostMember && hostMember.invite_quota === 0) {
    pass('a new member arrives with no invites to give (quota 0)');
  } else if (hostMember) {
    fail(`a new member arrived with quota ${hostMember.invite_quota}`, 'expected 0 — inviting is granted, not given');
  }

  const GOOD = await seedCode(`VFY${stamp}A`.slice(0, 12).toUpperCase(), hostData.user.id);
  const SPENT = await seedCode(`VFY${stamp}B`.slice(0, 12).toUpperCase(), hostData.user.id);
  const EXPIRED = await seedCode(`VFY${stamp}C`.slice(0, 12).toUpperCase(), hostData.user.id, {
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });

  // --- 1. THE POINT OF THIS SCRIPT ----------------------------------------
  // A real signUp, with the code in options.data exactly as features/auth/api.ts
  // sends it. If this passes, options.data really does reach user_metadata and
  // raw_user_meta_data, which every SQL test takes on faith.
  const guestEmail = email('guest');
  const { data: guestData, error: guestErr } = await anon().auth.signUp({
    email: guestEmail,
    password: PASSWORD,
    options: { data: { invite_code: GOOD.toLowerCase() } },   // also tests normalisation
  });
  await trackByEmail(guestEmail);

  if (guestErr) {
    fail('a real signUp with a valid code was rejected', guestErr.message);
  } else {
    pass('a real signUp carries the code through to the database (lower-case matched)');

    const { data: consumed } = await admin
      .from('invites').select('redeemed_by, redeemed_at').eq('code', GOOD).single();
    if (consumed?.redeemed_by === guestData.user.id && consumed.redeemed_at) {
      pass('the code was consumed, atomically with the signup');
    } else {
      fail('the code was not marked redeemed by the new account');
    }

    const { data: guestMember } = await admin
      .from('app_members').select('user_id, invited_by').eq('user_id', guestData.user.id).maybeSingle();
    if (guestMember?.invited_by === hostData.user.id) pass('membership recorded, attributed to the inviter');
    else fail('membership row missing, or not attributed to the inviter');
  }

  // --- 2. THE HOOK --------------------------------------------------------
  // A codeless signUp. The database trigger alone would already refuse this,
  // but with an ugly "Database error saving new user"; the hook is what turns
  // it into the message the sign-up screen shows. Distinguish the two, because
  // "rejected" alone would hide a disabled hook.
  const noCodeEmail = email('nocode');
  const { error: noCodeErr } = await anon().auth.signUp({
    email: noCodeEmail, password: PASSWORD, options: { data: { invite_code: '' } },
  });
  await trackByEmail(noCodeEmail);

  if (!noCodeErr) {
    fail('a signUp with no code was ACCEPTED',
         'both the hook AND the auth.users trigger failed to refuse it — this is the gate wide open');
  } else if (/invite only/i.test(noCodeErr.message)) {
    pass('a codeless signUp is refused at the door, with the hook’s message');
  } else {
    fail('a codeless signUp was refused, but by the database trigger rather than the hook',
         `got: "${noCodeErr.message}"\n      The gate holds, but the message is unreadable. Enable the hook:\n      Dashboard → Authentication → Hooks → Before User Created →\n      pg-functions://postgres/public/hook_require_invite`);
  }

  // --- 3. bad, spent and expired codes ------------------------------------
  for (const [label, code] of [['an unknown', 'NOTAREALCODE'], ['an expired', EXPIRED], ['an already-used', GOOD]]) {
    const addr = email(`bad-${label.replace(/\W/g, '')}`);
    const { error } = await anon().auth.signUp({
      email: addr, password: PASSWORD, options: { data: { invite_code: code } },
    });
    await trackByEmail(addr);
    if (error) pass(`${label} code is refused`);
    else fail(`${label} code was ACCEPTED`);
  }

  // --- 4. REGRESSION: a spent code must stay spent after the redeemer leaves
  // invites.redeemed_by is ON DELETE SET NULL. Availability is tested on
  // redeemed_at for exactly this reason; if that ever regresses, deleting an
  // account silently reopens the code it was used with.
  const leaverEmail = email('leaver');
  const { data: leaverData, error: leaverErr } = await anon().auth.signUp({
    email: leaverEmail, password: PASSWORD, options: { data: { invite_code: SPENT } },
  });
  await trackByEmail(leaverEmail);
  if (leaverErr) {
    fail('could not set up the departed-redeemer check', leaverErr.message);
  } else {
    await admin.auth.admin.deleteUser(leaverData.user.id);
    const i = createdUsers.indexOf(leaverData.user.id);
    if (i >= 0) createdUsers.splice(i, 1);

    const reuseEmail = email('afterleaver');
    const { error: reuseErr } = await anon().auth.signUp({
      email: reuseEmail, password: PASSWORD, options: { data: { invite_code: SPENT } },
    });
    await trackByEmail(reuseEmail);
    if (reuseErr) pass('a code stays spent after the account that used it is deleted');
    else fail('a spent code came back to life when its redeemer deleted their account',
              'availability must be tested on redeemed_at, not redeemed_by');
  }

  // --- 5. the quota is a grant, and an uninvited session is inert ----------
  const solo = anon();
  const { error: signInErr } = await solo.auth.signInWithPassword({ email: guestEmail, password: PASSWORD });
  if (signInErr) {
    console.log(`  · skipped the quota checks (could not sign in: ${signInErr.message})`);
  } else {
    const { error: mintErr } = await solo.rpc('create_invite');
    if (mintErr) pass('a member with no granted quota cannot mint a code');
    else fail('a member minted a code without being granted any');

    const { data: remaining } = await solo.rpc('my_invites_remaining');
    if (remaining === 0) pass('my_invites_remaining() reports 0 for an ungranted member');
    else fail(`my_invites_remaining() reported ${remaining}, expected 0`);

    // Strip their membership: this is the gate that holds even with the hook off.
    await admin.from('app_members').delete().eq('user_id', guestData.user.id);
    const { error: profileErr } = await solo
      .from('profiles').insert({ user_id: guestData.user.id, display_name: 'Should not exist' });
    if (profileErr) pass('an uninvited session cannot create a profile (RLS)');
    else fail('an uninvited session created a profile — profiles_insert is not gating');
  }

  console.log(failures === 0 ? '\nAll invite checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (err) {
  console.error(`\nVerification error: ${err.message || err}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
