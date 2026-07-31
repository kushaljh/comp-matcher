-- ============================================================================
-- Comp Matcher — Admin panel: vouching gate, audit trail, roster + overview
-- ============================================================================
-- Four changes, all in service of the admin panel becoming the place the
-- community is actually run from:
--
--   1. INVITING IS NOW A GRANTED PRIVILEGE. app_members.invite_quota defaults
--      to 0, so a dancer who just joined cannot immediately invite anyone.
--      An admin raises it. This is the vouching gate: whoever let you in
--      vouched for you, but you do not get to vouch for others until an admin
--      says so. Existing members are zeroed too (see the UPDATE below) so the
--      rule is uniform rather than "whoever happened to join first".
--
--   2. AN AUDIT TRAIL. admin_actions records who did what to whom and why.
--      With one admin this is a luxury; with two it is the difference between
--      "someone suspended her" and knowing which someone, when, and on what
--      grounds. Written by the RPCs below, never by the client.
--
--   3. admin_dancer_roster() — the roster with the invite graph attached.
--      This is NEW VISIBILITY and worth being deliberate about: until now
--      admins could see nothing about who vouched for whom. In an invite-only
--      community that trail is the point, so admins get inviter, signup date
--      and invite usage — and nothing else. Contacts, swipes and matches stay
--      exactly as private as they were.
--
--   4. admin_overview() — counts for the panel's landing page.
--
-- Everything an admin can DO stays behind a SECURITY DEFINER function rather
-- than an RLS policy, for the reason 20260728220000_suspend_users.sql spells
-- out: RLS cannot restrict WHICH COLUMNS a policy covers, so a policy broad
-- enough to let an admin set invite_quota would also let them rewrite
-- invited_by. A function touches one column and can be read in one sitting.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Inviting is granted, not given
-- ---------------------------------------------------------------------------
alter table public.app_members alter column invite_quota set default 0;

-- Zero out everyone who is not an admin. Nobody has actually minted an invite
-- yet, so this takes away nothing in practice — it just makes the new rule
-- true for the accounts that predate it as well as the ones that follow.
-- To hand the old default back to a single member:
--   select public.admin_set_invite_quota('<profile-id>', 3);
update public.app_members m
   set invite_quota = 0
 where not exists (
   select 1 from public.admin_users a where a.user_id = m.user_id
 );

-- ---------------------------------------------------------------------------
-- 2) Audit trail
-- ---------------------------------------------------------------------------
create table public.admin_actions (
  id           uuid primary key default gen_random_uuid(),
  -- Who acted. ON DELETE SET NULL: an admin leaving must not erase the record
  -- of what they did, which is the whole point of keeping one.
  actor        uuid references auth.users (id) on delete set null,
  actor_email  text,                    -- denormalised, so the name survives the account
  action       text not null,           -- 'suspend' | 'reinstate' | 'set_invite_quota' | ...
  -- What it was done to. Nullable + SET NULL for the same reason as actor.
  subject_user uuid references auth.users (id) on delete set null,
  subject_label text,                   -- display name / invite code at the time
  detail       jsonb not null default '{}'::jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);

create index admin_actions_created_idx on public.admin_actions (created_at desc);
create index admin_actions_subject_idx on public.admin_actions (subject_user);

alter table public.admin_actions enable row level security;

-- Readable by admins, writable by nobody through the API — every row is
-- written by a SECURITY DEFINER function below. No insert/update/delete
-- policy exists, so an admin cannot doctor the log through PostgREST either.
create policy admin_actions_select on public.admin_actions
  for select to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  );

grant select on public.admin_actions to authenticated;
grant all    on public.admin_actions to service_role;

-- Internal helper. Not callable from the API; the RPCs below use it so the
-- "am I an admin" check and the log write cannot drift apart.
create or replace function public.log_admin_action(
  p_action        text,
  p_subject_user  uuid,
  p_subject_label text,
  p_detail        jsonb default '{}'::jsonb,
  p_reason        text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = v_uid;

  insert into public.admin_actions (actor, actor_email, action, subject_user, subject_label, detail, reason)
  values (v_uid, v_email, p_action, p_subject_user, p_subject_label, coalesce(p_detail, '{}'::jsonb), p_reason);
end;
$$;

revoke execute on function public.log_admin_action(text, uuid, text, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) admin_set_invite_quota() — the vouching grant
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_invite_quota(
  p_profile_id uuid,
  p_quota      int
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_name  text;
  v_quota int := greatest(least(p_quota, 20), 0);   -- clamp: nobody needs 500
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  select p.user_id, p.display_name into v_user, v_name
  from public.profiles p where p.id = p_profile_id;

  if v_user is null then
    raise exception 'no such profile' using errcode = 'no_data_found';
  end if;

  update public.app_members m set invite_quota = v_quota where m.user_id = v_user;

  if not found then
    raise exception 'that dancer has no membership row' using errcode = 'no_data_found';
  end if;

  perform public.log_admin_action(
    'set_invite_quota', v_user, v_name,
    jsonb_build_object('quota', v_quota)
  );

  return v_quota;
end;
$$;

revoke execute on function public.admin_set_invite_quota(uuid, int) from public, anon;
grant  execute on function public.admin_set_invite_quota(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) admin_set_suspended() gains a reason and writes to the log
--
--    Dropped and recreated rather than CREATE OR REPLACE'd: adding a parameter
--    makes a new overload rather than replacing the old one, and two
--    admin_set_suspended functions would leave PostgREST guessing. The body is
--    otherwise the original from 20260728220000_suspend_users.sql.
-- ---------------------------------------------------------------------------
drop function public.admin_set_suspended(uuid, boolean);

create function public.admin_set_suspended(
  p_profile_id uuid,
  p_suspended  boolean,
  p_reason     text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new  timestamptz;
  v_user uuid;
  v_name text;
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.user_id = (select auth.uid())
  ) then
    raise exception 'an admin cannot suspend their own account'
      using errcode = 'check_violation';
  end if;

  v_new := case when p_suspended then now() else null end;

  update public.profiles
     set suspended_at = v_new
   where id = p_profile_id
  returning user_id, display_name into v_user, v_name;

  if not found then
    raise exception 'no such profile' using errcode = 'no_data_found';
  end if;

  perform public.log_admin_action(
    case when p_suspended then 'suspend' else 'reinstate' end,
    v_user, v_name, '{}'::jsonb, p_reason
  );

  return v_new;
end;
$$;

revoke execute on function public.admin_set_suspended(uuid, boolean, text) from public, anon;
grant  execute on function public.admin_set_suspended(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) admin_dancer_roster() — the roster, with the invite trail attached
--
--    Returns one row per PROFILE. Deliberately not a view or a set of RLS
--    policies: this is the exact column list admins may see, and it is short
--    enough to audit at a glance. auth.users.created_at in particular has no
--    other exposure to the client anywhere in this project.
-- ---------------------------------------------------------------------------
create or replace function public.admin_dancer_roster()
returns table (
  profile_id        uuid,
  user_id           uuid,
  display_name      text,
  photo_url         text,
  city              text,
  country           text,
  suspended_at      timestamptz,
  signed_up_at      timestamptz,
  onboarded_at      timestamptz,
  joined_at         timestamptz,
  invited_by_name   text,
  invite_quota      int,
  invites_created   int,
  invites_claimed   int
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    p.id,
    p.user_id,
    p.display_name,
    p.photo_url,
    p.city,
    p.country,
    p.suspended_at,
    u.created_at,
    p.created_at,
    m.joined_at,
    inviter.display_name,
    coalesce(m.invite_quota, 0),
    (select count(*)::int from public.invites i where i.created_by = p.user_id),
    (select count(*)::int from public.invites i
      where i.created_by = p.user_id and i.redeemed_by is not null)
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.app_members m on m.user_id = p.user_id
  left join public.profiles inviter on inviter.user_id = m.invited_by
  order by p.display_name;
end;
$$;

revoke execute on function public.admin_dancer_roster() from public, anon;
grant  execute on function public.admin_dancer_roster() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Invite deletions land in the log too
--
--    Deleting an invite is an RLS-governed DELETE rather than an RPC, so there
--    is no function to log from — hence a trigger. Without it the log would
--    quietly omit the one destructive thing an admin can do to another
--    member's codes, which is exactly the kind of gap that makes an audit
--    trail worthless. A member withdrawing their OWN unclaimed code is
--    ordinary housekeeping, not moderation, so it is not recorded.
-- ---------------------------------------------------------------------------
create or replace function public.log_invite_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.created_by <> (select auth.uid())
     and exists (
       select 1 from public.admin_users a where a.user_id = (select auth.uid())
     )
  then
    perform public.log_admin_action(
      'delete_invite',
      old.created_by,
      old.code,
      jsonb_build_object('claimed', old.redeemed_by is not null)
    );
  end if;
  return old;
end;
$$;

create trigger on_invite_deleted_log
  after delete on public.invites
  for each row execute function public.log_invite_deletion();

-- ---------------------------------------------------------------------------
-- 7) admin_overview() — the numbers the panel's landing page shows
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  ) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'members',            (select count(*) from public.app_members),
    'dancers',            (select count(*) from public.profiles),
    'suspended',          (select count(*) from public.profiles where suspended_at is not null),
    'joined_last_7d',     (select count(*) from public.app_members where joined_at > now() - interval '7 days'),
    'pending_events',     (select count(*) from public.events where status = 'pending'),
    'invites_outstanding',(select count(*) from public.invites where redeemed_by is null),
    'invites_claimed',    (select count(*) from public.invites where redeemed_by is not null),
    'can_invite',         (select count(*) from public.app_members where invite_quota > 0)
  );
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant  execute on function public.admin_overview() to authenticated;
