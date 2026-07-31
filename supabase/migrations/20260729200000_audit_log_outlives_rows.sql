-- ============================================================================
-- Comp Matcher — The audit log must outlive what it describes
-- ============================================================================
-- Deleting a user who had ever created an invite failed outright:
--
--   ERROR 23503: insert or update on table "admin_actions" violates foreign
--   key constraint "admin_actions_subject_user_fkey"
--
-- The chain: delete an auth.users row -> their invites cascade away
-- (invites.created_by is ON DELETE CASCADE) -> on_invite_deleted_log fires ->
-- log_admin_action() tries to insert an admin_actions row whose subject_user
-- is the very user being deleted. ON DELETE SET NULL does not save it; the
-- parent is already going, so the INSERT itself is what fails.
--
-- Only reachable from a session whose auth.uid() is an admin deleting someone
-- else, which the app does not currently offer (removal is suspension, and
-- delete_my_account() deletes the caller, where the trigger's
-- `created_by <> auth.uid()` guard means nothing is logged). So this is a
-- latent trap rather than a live outage — but it is the kind that detonates
-- the first time anyone adds an admin delete or runs a cleanup script under an
-- admin session, with an error message that points at the wrong thing.
--
-- The real mistake is the foreign keys. An audit trail exists precisely to
-- outlast the rows it talks about; pointing it at auth.users makes its
-- integrity depend on the lifetime of the thing being audited, and would let
-- a deletion cascade quietly blank out who did what. The identifying
-- information is already denormalised into actor_email and subject_label for
-- exactly this reason, so the uuids can stand as plain references.
-- ============================================================================

alter table public.admin_actions drop constraint admin_actions_actor_fkey;
alter table public.admin_actions drop constraint admin_actions_subject_user_fkey;

comment on column public.admin_actions.actor is
  'auth.users id at the time of the action. Intentionally NOT a foreign key: the log outlives the accounts it describes. actor_email carries the readable record.';
comment on column public.admin_actions.subject_user is
  'auth.users id at the time of the action. Intentionally NOT a foreign key — see actor. subject_label carries the readable record.';
