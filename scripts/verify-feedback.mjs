// ============================================================================
// Feedback — live verification
// ----------------------------------------------------------------------------
// Exercises the paths the feedback feature relies on, against the LIVE hosted
// Supabase project, through the same RLS the app runs under (ANON clients
// signed in as throwaway users for every assertion; the service role is used
// ONLY for setup/cleanup, never for the assertions themselves).
//
// The two facts most worth proving here are the ones that are easy to get
// wrong and silent when you do:
//   * a sender cannot read back their own note — which is why the client's
//     insert must not chain .select() (features/feedback/api.ts)
//   * resolving is admin-only and lands in the admin log
//
// Coverage:
//   1. a member can file a note, and the trigger stamps who they were
//   2. the same insert WITH .select() fails — the shape the client must avoid
//   3. a member reads back zero rows, including their own note
//   4. a member cannot file a note in someone else's name
//   5. a non-admin cannot call admin_set_feedback_status
//   6. an admin sees the note, with author_name/author_email attached
//   7. admin_overview counts it as new
//   8. an admin resolves it: status/resolved_at/resolved_by set
//   9. a 'resolve_feedback' row lands in admin_actions
//
// Usage:  node scripts/verify-feedback.mjs
// Needs (from .env at repo root, or the environment):
//   EXPO_PUBLIC_SUPABASE_URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// --- tiny .env parser (no dotenv dependency), matching scripts/verify-admin.mjs
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

async function signInAnon(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, clientOpts);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return client;
}

const PASSWORD = 'FeedbackVerify123!';
const USERS = {
  owner: { email: 'feedback-owner@verify.test' }, // granted admin
  sender: { email: 'feedback-sender@verify.test' }, // stays a regular member
};

// --- tiny test harness (matches scripts/verify-admin.mjs) --------------------
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

const state = {
  ownerUserId: null,
  senderUserId: null,
  feedbackIds: [],
};

async function createThrowawayUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  return data.user.id;
}

async function cleanup() {
  console.log('\n--- cleanup ---');
  for (const id of state.feedbackIds) {
    const { error } = await admin.from('feedback').delete().eq('id', id);
    if (error) console.log(`  cleanup warning: could not delete feedback ${id}: ${error.message}`);
  }
  // The admin log is append-only by design, but these rows are noise from a
  // test run, so the service role clears the ones this script caused.
  for (const userId of [state.senderUserId].filter(Boolean)) {
    const { error } = await admin.from('admin_actions').delete().eq('subject_user', userId);
    if (error) console.log(`  cleanup warning: could not clear admin_actions: ${error.message}`);
  }
  for (const [label, userId] of [
    ['owner', state.ownerUserId],
    ['sender', state.senderUserId],
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

async function main() {
  console.log('--- setup: throwaway users (owner/sender) ---');
  state.ownerUserId = await createThrowawayUser(USERS.owner.email);
  state.senderUserId = await createThrowawayUser(USERS.sender.email);

  // A profile, so the author-stamping trigger has a display_name to copy.
  const { error: profileErr } = await admin
    .from('profiles')
    .insert({ user_id: state.senderUserId, display_name: 'Feedback Sender' });
  if (profileErr) throw new Error(`create sender profile: ${profileErr.message}`);

  const { error: grantErr } = await admin.from('admin_users').insert({ user_id: state.ownerUserId });
  if (grantErr) throw new Error(`grant admin: ${grantErr.message}`);
  console.log(`setup complete: owner=${state.ownerUserId} sender=${state.senderUserId}`);

  // ---------------------------------------------------------------------------
  console.log('\n--- as the sender (ordinary member) ---');
  const senderClient = await signInAnon(USERS.sender.email, PASSWORD);

  const { error: sendErr } = await senderClient
    .from('feedback')
    .insert({ category: 'bug', message: 'Verify: the deck dealt me my own card.', author: state.senderUserId });
  checkErrorFree('a member can file a note (bare insert, no .select())', sendErr);

  // The exact shape features/feedback/api.ts must NOT use: asking for the row
  // back needs a select policy the sender does not have.
  const { error: selectBackErr } = await senderClient
    .from('feedback')
    .insert({ category: 'other', message: 'Verify: this one asks for a receipt.', author: state.senderUserId })
    .select('id')
    .single();
  check(
    'the same insert WITH .select() fails — the shape the client must avoid',
    !!selectBackErr,
    'insert().select() unexpectedly succeeded'
  );

  const { data: ownNotes, error: readOwnErr } = await senderClient.from('feedback').select('*');
  checkErrorFree('a member can query feedback (not necessarily see anything)', readOwnErr);
  check(
    'a member reads back zero rows, including their own note',
    (ownNotes ?? []).length === 0,
    JSON.stringify(ownNotes)
  );

  const { error: forgeErr } = await senderClient
    .from('feedback')
    .insert({ category: 'other', message: 'Verify: signed, the admin.', author: state.ownerUserId });
  check('a member cannot file a note in someone else\'s name', !!forgeErr, 'insert unexpectedly succeeded');

  // ---------------------------------------------------------------------------
  console.log('\n--- as an admin ---');
  const ownerClient = await signInAnon(USERS.owner.email, PASSWORD);

  const { data: asAdmin, error: adminReadErr } = await ownerClient
    .from('feedback')
    .select('*')
    .eq('author', state.senderUserId);
  checkErrorFree('an admin can read feedback', adminReadErr);
  const note = (asAdmin ?? [])[0];
  if (note?.id) state.feedbackIds.push(note.id);
  // The second insert above was rejected outright, so exactly one note landed.
  check('the admin sees the sender\'s note', (asAdmin ?? []).length === 1, JSON.stringify(asAdmin));
  check(
    'the note carries the stamped author identity',
    note?.author_name === 'Feedback Sender' && note?.author_email === USERS.sender.email,
    `name=${note?.author_name} email=${note?.author_email}`
  );
  check('the note landed unresolved', note?.status === 'new', `status=${note?.status}`);

  // The non-admin capability check has to come after the note exists, because
  // it needs a real id to aim at.
  const { error: nonAdminRpcErr } = await senderClient.rpc('admin_set_feedback_status', {
    p_id: note?.id,
    p_status: 'resolved',
  });
  check('a non-admin cannot resolve feedback', !!nonAdminRpcErr, 'rpc unexpectedly succeeded');

  const { data: overview, error: overviewErr } = await ownerClient.rpc('admin_overview');
  checkErrorFree('an admin can read the overview', overviewErr);
  check(
    'admin_overview counts the new note',
    (overview?.feedback_new ?? 0) >= 1,
    `feedback_new=${overview?.feedback_new}`
  );

  const { error: resolveErr } = await ownerClient.rpc('admin_set_feedback_status', {
    p_id: note?.id,
    p_status: 'resolved',
  });
  checkErrorFree('an admin can resolve a note', resolveErr);

  const { data: resolved } = await admin.from('feedback').select('*').eq('id', note?.id ?? '').maybeSingle();
  check(
    'the note is actually resolved, by that admin',
    resolved?.status === 'resolved' &&
      resolved?.resolved_at != null &&
      resolved?.resolved_by === state.ownerUserId,
    JSON.stringify(resolved)
  );

  const { data: logged } = await admin
    .from('admin_actions')
    .select('*')
    .eq('action', 'resolve_feedback')
    .eq('subject_user', state.senderUserId);
  check('resolving landed in the admin log', (logged ?? []).length === 1, JSON.stringify(logged));
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
