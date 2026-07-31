-- ============================================================================
-- Comp Matcher — Revoke the default grants on the invite/admin tables
-- ============================================================================
-- Writing a test that expected `delete from admin_actions` to raise turned up
-- something worth recording: it does not raise. It silently affects zero rows.
--
-- The reason is that this project's default privileges already grant
-- authenticated the full DML set on every new table in public — SELECT,
-- INSERT, UPDATE, DELETE, TRUNCATE. The careful `grant select on ...` lines in
-- 20260727120100_rls.sql and in the invite migrations were therefore ADDITIVE
-- on top of everything, not the least-privilege statements they read as.
--
-- Nothing is actually exposed: RLS is doing the work everywhere. A table with
-- no UPDATE policy filters every row out of the UPDATE, so the statement
-- succeeds against nothing. That is why the app behaves correctly today and
-- why the RLS tests pass.
--
-- But "safe because one layer holds" is a worse place to be than "safe because
-- both do", and admin_actions is exactly the table where that matters: the
-- whole value of an audit log is that the person being audited cannot edit it.
-- So the three tables introduced by the invite work drop the privileges they
-- never wanted, leaving RLS as the second line rather than the only one.
--
-- Deliberately scoped to these three. The same default applies to profiles,
-- swipes, matches and the rest, and tightening those is worth doing — but it
-- is a change to code this branch did not otherwise touch, and it belongs in
-- its own pass with its own testing rather than riding along here.
-- ============================================================================

-- admin_actions: readable by admins, written only by log_admin_action().
-- Append-only now means append-only at the privilege level too.
revoke insert, update, delete, truncate on public.admin_actions from authenticated;

-- app_members: read your own row, and nothing else. Membership is granted by
-- the auth.users trigger or claim_invite(), never by a client write.
revoke insert, update, delete, truncate on public.app_members from authenticated;

-- invites: SELECT (your own, or all of them if you are an admin) and DELETE
-- (governed by invites_delete / invites_admin_delete). Minting goes through
-- create_invite(); redemption goes through claim_invite(). Neither is an
-- INSERT or UPDATE the client should be able to attempt.
revoke insert, update, truncate on public.invites from authenticated;
