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
// Also covers the Fix pass regression (verifier finding F1): simulates the
// partial-failure state a flaky retry can leave behind (profile row exists,
// contacts/history rows don't) and asserts that re-running the same write
// sequence converges cleanly instead of hitting 23505 unique_violation on
// profiles.user_id.
//
// Usage: node scripts/verify-wp1.mjs   (run from the worktree root)
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY   (server-only; bypasses RLS — used only to
//                                 create/delete the throwaway users and to
//                                 remove the uploaded storage objects)
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

// Mirrors features/auth/api.ts's submitOnboarding(): upload photo -> upsert
// profile (onConflict: user_id) -> delete-then-insert contacts -> delete-
// then-insert history. Kept in lockstep with that function so this script
// actually exercises the fix, not just "an" onboarding write path.
async function performOnboardingWrites(userId, { photoSuffix, displayName, values, bio, contacts, history }) {
  const photoPath = `${userId}/avatar-verify-${photoSuffix}.png`;
  const { error: uploadErr } = await anon.storage
    .from('profile-photos')
    .upload(photoPath, TINY_PNG, { contentType: 'image/png' });
  if (uploadErr) throw uploadErr;
  // The bucket is private now: the app stores the object PATH, not a URL.

  const { data: profile, error: profileErr } = await anon
    .from('profiles')
    .upsert(
      { user_id: userId, display_name: displayName, values, bio, photo_url: photoPath },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single();
  if (profileErr) throw profileErr;
  const profileId = profile.id;

  const { error: delContactsErr } = await anon.from('profile_contacts').delete().eq('profile_id', profileId);
  if (delContactsErr) throw delContactsErr;
  if (contacts.length > 0) {
    const { error } = await anon
      .from('profile_contacts')
      .insert(contacts.map((c) => ({ profile_id: profileId, ...c })));
    if (error) throw error;
  }

  const { error: delHistoryErr } = await anon.from('competition_history').delete().eq('profile_id', profileId);
  if (delHistoryErr) throw delHistoryErr;
  if (history.length > 0) {
    const { error } = await anon.from('competition_history').insert(history.map((h) => ({ profile_id: profileId, ...h })));
    if (error) throw error;
  }

  return { profileId, photoPath };
}

let userAId = null;
let userBId = null;
const uploadedPaths = [];

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

  // --- full onboarding write flow (upload, profile, >=2 contacts, 1 history) --
  let firstAttempt;
  let firstErr = null;
  try {
    firstAttempt = await performOnboardingWrites(userAId, {
      photoSuffix: 'first',
      displayName: 'WP1 Verify User',
      values: ['winning', 'yolo'],
      bio: 'Created by scripts/verify-wp1.mjs',
      contacts: [
        { platform: 'instagram', handle: '@wp1verify' },
        { platform: 'email', handle: EMAIL_A },
      ],
      history: [{ event_name: 'WP1 Verify Classic', year: 2025, contest_name: 'Strictly Verify', placement: '1st' }],
    });
  } catch (err) {
    firstErr = err;
  }
  assert(!firstErr, `onboarding write flow completes: upload + profile upsert + contacts + history (${firstErr?.message ?? 'ok'})`);
  if (firstErr) throw firstErr;
  uploadedPaths.push(firstAttempt.photoPath);
  const profileId = firstAttempt.profileId;

  // --- read back + assert (same shape the UI's useHasProfile / screens read) ---
  const { data: readProfile, error: readProfileErr } = await anon
    .from('profiles')
    .select('id, display_name, photo_url, values, bio')
    .eq('user_id', userAId)
    .maybeSingle();
  assert(!readProfileErr && readProfile !== null, `read back own profile row (${readProfileErr?.message ?? 'ok'})`);
  assert(readProfile?.display_name === 'WP1 Verify User', 'profile.display_name round-trips');
  assert(readProfile?.photo_url === firstAttempt.photoPath, 'profile.photo_url round-trips as a storage PATH');

  // --- private bucket: signed URLs work, anonymous reads do not ---------------
  // This is the whole point of making profile-photos private, so assert both
  // halves rather than trusting the bucket flag.
  const { data: signed, error: signErr } = await anon.storage
    .from('profile-photos')
    .createSignedUrl(firstAttempt.photoPath, 60);
  assert(!signErr && !!signed?.signedUrl, `signed in: can mint a signed URL (${signErr?.message ?? 'ok'})`);

  if (signed?.signedUrl) {
    const signedRes = await fetch(signed.signedUrl);
    assert(signedRes.ok, `the signed URL actually serves the object (HTTP ${signedRes.status})`);
  }

  // The old public-object address must no longer serve anything, with no auth
  // header at all — this is what a leaked URL would look like.
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/profile-photos/${firstAttempt.photoPath}`;
  const anonRes = await fetch(publicUrl);
  assert(
    !anonRes.ok,
    `anonymous read of the raw object URL is refused (HTTP ${anonRes.status})`
  );

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

  // --- regression (verifier finding F1): simulate a partial-failure state, --
  // then assert a retry with full data converges instead of getting wedged --
  // (23505 unique_violation on profiles.user_id) ------------------------------
  const { error: stripContactsErr } = await anon.from('profile_contacts').delete().eq('profile_id', profileId);
  const { error: stripHistoryErr } = await anon.from('competition_history').delete().eq('profile_id', profileId);
  assert(
    !stripContactsErr && !stripHistoryErr,
    'simulate partial-failure state: strip contacts + history, keep the profile row'
  );

  const { data: strippedContacts } = await anon.from('profile_contacts').select('id').eq('profile_id', profileId);
  const { data: strippedHistory } = await anon.from('competition_history').select('id').eq('profile_id', profileId);
  assert(
    (strippedContacts?.length ?? 0) === 0 && (strippedHistory?.length ?? 0) === 0,
    'partial state confirmed: profile exists, zero contacts, zero history rows'
  );

  let retryAttempt;
  let retryErr = null;
  try {
    retryAttempt = await performOnboardingWrites(userAId, {
      photoSuffix: 'retry',
      displayName: 'WP1 Verify User (retried)',
      values: ['winning', 'yolo'],
      bio: 'Retried after a simulated partial failure',
      contacts: [
        { platform: 'instagram', handle: '@wp1verify' },
        { platform: 'whatsapp', handle: '+15550009999' },
      ],
      history: [{ event_name: 'WP1 Verify Classic', year: 2025, contest_name: 'Strictly Verify', placement: '1st' }],
    });
  } catch (err) {
    retryErr = err;
  }
  assert(
    !retryErr,
    `retry with full data after simulated partial failure succeeds, no 23505 (${retryErr?.message ?? 'ok'})`
  );
  if (!retryErr) {
    uploadedPaths.push(retryAttempt.photoPath);
    assert(retryAttempt.profileId === profileId, 'retry upserts the SAME profile row (same id), not a duplicate');

    const { data: finalProfile } = await anon
      .from('profiles')
      .select('display_name, photo_url')
      .eq('id', profileId)
      .maybeSingle();
    assert(finalProfile?.display_name === 'WP1 Verify User (retried)', 'profile reflects the retried submit data');
    assert(finalProfile?.photo_url === retryAttempt.photoPath, 'photo_url reflects the retried upload');

    const { data: finalContacts } = await anon.from('profile_contacts').select('platform, handle').eq('profile_id', profileId);
    assert((finalContacts?.length ?? 0) >= 2, `retry converges with >=2 contacts (got ${finalContacts?.length ?? 0})`);

    const { data: finalHistory } = await anon.from('competition_history').select('event_name').eq('profile_id', profileId);
    assert((finalHistory?.length ?? 0) >= 1, `retry converges with >=1 history row (got ${finalHistory?.length ?? 0})`);
  }

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
  for (const path of uploadedPaths) {
    const { error } = await admin.storage.from('profile-photos').remove([path]);
    if (error) console.error(`cleanup: failed to remove ${path}: ${error.message}`);
    else console.log(`cleanup: removed storage object ${path}`);
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
