// ============================================================================
// Comp Matcher — WP1 (Auth + Onboarding) live verification
// ============================================================================
// Proves the onboarding write flow against the LIVE hosted Supabase project
// using the ANON client (so RLS + storage policies are actually exercised,
// not bypassed). Creates two throwaway users via the service-role admin API
// (emails under @verify.test), performs the same writes
// features/auth/api.ts's submitOnboarding() performs as user A, reads them
// back, asserts a cross-user storage write is rejected by policy, then
// deletes everything it created (storage objects + both users).
//
// Usage: node scripts/verify-wp1.mjs   (run from the worktree root)
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY   (server-only; bypasses RLS — used only to
//                                 create/delete the throwaway users and to
//                                 remove the uploaded storage object)
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
  console.error(
    'Missing EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY (set them in .env or the environment).'
  );
  process.exit(1);
}

const clientOpts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(SUPABASE_URL, SERVICE_KEY, clientOpts);
const anon = createClient(SUPABASE_URL, ANON_KEY, clientOpts);

const PASSWORD = 'Wp1Verify123!';
const stamp = Date.now();
const EMAIL_A = `wp1-verify-a-${stamp}@verify.test`;
const EMAIL_B = `wp1-verify-b-${stamp}@verify.test`;

// Smallest valid 1x1 transparent PNG — stands in for a "generated PNG" upload
// without pulling in an image-encoding dependency.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

let pass = 0;
let fail = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`PASS: ${message}`);
    pass += 1;
  } else {
    console.error(`FAIL: ${message}`);
    fail += 1;
  }
}

let userAId = null;
let userBId = null;
let uploadedPath = null;

try {
  // --- setup: two throwaway confirmed users ---------------------------------
  const { data: userA, error: createAErr } = await admin.auth.admin.createUser({
    email: EMAIL_A,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createAErr) throw new Error(`create throwaway user A: ${createAErr.message}`);
  userAId = userA.user.id;
  console.log(`setup: created throwaway user A (${EMAIL_A})`);

  const { data: userB, error: createBErr } = await admin.auth.admin.createUser({
    email: EMAIL_B,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createBErr) throw new Error(`create throwaway user B: ${createBErr.message}`);
  userBId = userB.user.id;
  console.log(`setup: created throwaway user B (${EMAIL_B})`);

  // --- sign in as user A with the ANON client (RLS applies from here on) ----
  const { error: signInErr } = await anon.auth.signInWithPassword({ email: EMAIL_A, password: PASSWORD });
  assert(!signInErr, `sign in as user A with the anon client (${signInErr?.message ?? 'ok'})`);
  if (signInErr) throw new Error(signInErr.message);

  // --- upload avatar into own storage folder (the UI's first onboarding step)
  uploadedPath = `${userAId}/avatar-verify.png`;
  const { error: uploadErr } = await anon.storage
    .from('profile-photos')
    .upload(uploadedPath, TINY_PNG, { contentType: 'image/png' });
  assert(!uploadErr, `upload tiny PNG into own storage folder (${uploadErr?.message ?? 'ok'})`);

  const { data: publicUrlData } = anon.storage.from('profile-photos').getPublicUrl(uploadedPath);
  assert(!!publicUrlData?.publicUrl, 'get public URL for uploaded avatar');

  // --- insert profile (with photo_url set from the upload) -------------------
  const { data: profile, error: profileErr } = await anon
    .from('profiles')
    .insert({
      user_id: userAId,
      display_name: 'WP1 Verify User',
      role: 'leader',
      values: ['winning', 'yolo'],
      bio: 'Created by scripts/verify-wp1.mjs',
      photo_url: publicUrlData?.publicUrl ?? null,
    })
    .select('id')
    .single();
  assert(!profileErr && !!profile, `insert profile row (${profileErr?.message ?? 'ok'})`);
  const profileId = profile?.id;

  // --- insert >=2 contacts -----------------------------------------------------
  const { error: contactsErr } = await anon.from('profile_contacts').insert([
    { profile_id: profileId, platform: 'instagram', handle: '@wp1verify' },
    { profile_id: profileId, platform: 'email', handle: EMAIL_A },
  ]);
  assert(!contactsErr, `insert 2 contacts (${contactsErr?.message ?? 'ok'})`);

  // --- insert 1 competition history row -----------------------------------------
  const { error: historyErr } = await anon.from('competition_history').insert({
    profile_id: profileId,
    event_name: 'WP1 Verify Classic',
    year: 2025,
    contest_name: 'Strictly Verify',
    placement: '1st',
  });
  assert(!historyErr, `insert 1 competition history row (${historyErr?.message ?? 'ok'})`);

  // --- read back + assert (same shape the UI's useHasProfile / screens read) ---
  const { data: readProfile, error: readProfileErr } = await anon
    .from('profiles')
    .select('id, display_name, role, photo_url, values, bio')
    .eq('user_id', userAId)
    .maybeSingle();
  assert(!readProfileErr && readProfile !== null, `read back own profile row (${readProfileErr?.message ?? 'ok'})`);
  assert(readProfile?.display_name === 'WP1 Verify User', 'profile.display_name round-trips');
  assert(readProfile?.role === 'leader', 'profile.role round-trips');
  assert(readProfile?.photo_url === publicUrlData?.publicUrl, 'profile.photo_url round-trips');

  const { data: readContacts, error: readContactsErr } = await anon
    .from('profile_contacts')
    .select('platform, handle')
    .eq('profile_id', profileId);
  assert(!readContactsErr && (readContacts?.length ?? 0) >= 2, `read back >=2 contacts (got ${readContacts?.length ?? 0})`);

  const { data: readHistory, error: readHistoryErr } = await anon
    .from('competition_history')
    .select('event_name, year, contest_name, placement')
    .eq('profile_id', profileId);
  assert(
    !readHistoryErr && (readHistory?.length ?? 0) >= 1,
    `read back >=1 competition history row (got ${readHistory?.length ?? 0})`
  );

  // --- negative: uploading into a DIFFERENT user's folder must FAIL ------------
  const { error: crossUploadErr } = await anon.storage
    .from('profile-photos')
    .upload(`${userBId}/hijack.png`, TINY_PNG, { contentType: 'image/png' });
  assert(!!crossUploadErr, "upload into a DIFFERENT user's storage folder is rejected by policy");
} catch (err) {
  console.error(`UNEXPECTED ERROR: ${err.message ?? err}`);
  fail += 1;
} finally {
  // --- cleanup: storage object(s) + both throwaway users ------------------------
  if (uploadedPath) {
    const { error } = await admin.storage.from('profile-photos').remove([uploadedPath]);
    if (error) console.error(`cleanup: failed to remove ${uploadedPath}: ${error.message}`);
    else console.log(`cleanup: removed storage object ${uploadedPath}`);
  }
  await anon.auth.signOut().catch(() => {});
  if (userAId) {
    const { error } = await admin.auth.admin.deleteUser(userAId);
    if (error) console.error(`cleanup: failed to delete user A: ${error.message}`);
    else console.log('cleanup: deleted throwaway user A');
  }
  if (userBId) {
    const { error } = await admin.auth.admin.deleteUser(userBId);
    if (error) console.error(`cleanup: failed to delete user B: ${error.message}`);
    else console.log('cleanup: deleted throwaway user B');
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
