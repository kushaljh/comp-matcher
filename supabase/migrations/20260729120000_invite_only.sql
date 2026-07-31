-- ============================================================================
-- Comp Matcher — Invite-only access
-- ============================================================================
-- Turns open signup into growth-by-invitation. Two tables:
--   1. invites     — shareable codes. One code, one redemption.
--   2. app_members — "this user is allowed in", plus their invite quota.
--
-- There is no server in this project: the web build is a static Expo export
-- and the anon key ships in the bundle, so every gate has to live in Postgres.
-- Access is enforced in TWO independent places, on purpose:
--
--   a) hook_require_invite() wired to Supabase Auth's `before_user_created`
--      hook. Rejects a signup that carries no valid code BEFORE an auth user
--      is created, so nobody accumulates junk accounts. This is the good
--      experience, but it depends on a dashboard/config toggle.
--
--   b) profiles_insert (replaced below) additionally requires an app_members
--      row. This is the guarantee: it holds even if the hook is off or
--      misconfigured. Without it a user cannot onboard, and without a profile
--      the app has nothing to show them.
--
-- Every write into app_members funnels through ONE function, claim_invite(),
-- called from exactly two places:
--   * handle_new_user_invite(), an AFTER INSERT trigger on auth.users — the
--     normal path. The code rides in on signUp's `options.data`, which lands
--     in raw_user_meta_data. Consuming here is atomic with the user insert;
--     the hook cannot consume, because at hook time the user does not exist.
--   * redeem_invite(), an RPC — the recovery path for a session that somehow
--     has no membership (hook disabled, or an account made before this
--     migration by someone who never onboarded).
--
-- Invite creation is deliberately NOT a plain INSERT: invites has no insert or
-- update policy at all, mirroring the admin_users precedent in
-- 20260728100000_admin.sql. create_invite() is the only way to mint one, which
-- keeps the quota rule in a single place that RLS cannot be talked around.
--
-- Grandfathering: the backfill below gives every account that exists when this
-- migration runs an app_members row, so current users never see a code prompt.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,                                  -- null = never expires
  -- unique: an account can never consume more than one code.
  redeemed_by uuid unique references auth.users (id) on delete set null,
  redeemed_at timestamptz
);

create index invites_created_by_idx on public.invites (created_by);

-- ---------------------------------------------------------------------------
-- app_members
-- ---------------------------------------------------------------------------
create table public.app_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- Who let them in. ON DELETE SET NULL so a departing inviter does not take
  -- the people they invited with them.
  invited_by   uuid references auth.users (id) on delete set null,
  invite_id    uuid references public.invites (id) on delete set null,
  invite_quota int not null default 3,
  joined_at    timestamptz not null default now()
);

-- Grandfather every existing account.
insert into public.app_members (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Grants + RLS. New tables need explicit grants under this project's
-- auto-expose settings, exactly as in 20260727120100_rls.sql — without them
-- every call fails with "permission denied for table".
-- ---------------------------------------------------------------------------
-- No insert/update for authenticated on invites: minting goes through
-- create_invite(). DELETE is granted so a member can take back a code they
-- have not given out yet (policy below restricts it to unredeemed own rows).
grant select, delete on public.invites     to authenticated;
grant select         on public.app_members to authenticated;
grant all on public.invites, public.app_members to service_role;

alter table public.invites     enable row level security;
alter table public.app_members enable row level security;

-- See your own codes.
create policy invites_select on public.invites
  for select to authenticated
  using (created_by = (select auth.uid()));

-- Admins see every code (who invited whom). Same inlined EXISTS shape as the
-- admin policies in 20260728100000_admin.sql — non-recursive, because it only
-- ever asks "is my own uid in admin_users?", which admin_users' own-row SELECT
-- policy already permits.
create policy invites_admin_select on public.invites
  for select to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  );

-- Withdraw a code you have not given out. Redeemed codes are immutable — they
-- are the record of how a member got in.
create policy invites_delete on public.invites
  for delete to authenticated
  using (created_by = (select auth.uid()) and redeemed_by is null);

-- Own-row read only, like admin_users_select: lets the app ask "am I a
-- member?" without exposing the roster. No user-facing writes.
create policy app_members_select on public.app_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles_insert: replaced to require membership.
--   The original (20260727120100_rls.sql) was `user_id = auth.uid()`. Keeping
--   that condition and ANDing membership means an uninvited session can hold
--   an auth user but can never create a profile — and AuthGate parks it on the
--   invite screen. profiles_update is left alone: having a profile at all
--   already implies membership.
-- ---------------------------------------------------------------------------
drop policy profiles_insert on public.profiles;

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.app_members m
      where m.user_id = (select auth.uid())
    )
  );

-- ===========================================================================
-- Functions
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- normalize_invite_code(): codes are compared in a canonical form, so
-- "foxtrot-7q2x", "FOXTROT 7Q2X" and "foxtrot7q2x" all resolve to the same
-- row. Stored codes are always already normalized.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- claim_invite(): the single write path into app_members.
--
-- SECURITY DEFINER and internal — execute is revoked from anon/authenticated
-- so it can only be reached via the trigger or redeem_invite().
--
-- The consume is a conditional UPDATE ... WHERE redeemed_by IS NULL, so two
-- signups racing the same code cannot both win: the loser gets `not found`
-- and raises, which aborts their auth.users insert. Failing closed is the
-- right call for an invite-only app.
-- ---------------------------------------------------------------------------
create or replace function public.claim_invite(p_user uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code    text := public.normalize_invite_code(p_code);
  v_invite  uuid;
  v_inviter uuid;
begin
  if p_user is null then
    raise exception 'not authenticated';
  end if;

  -- Already a member (re-entering the invite screen, or a retried signup):
  -- succeed without burning a second code.
  if exists (select 1 from public.app_members m where m.user_id = p_user) then
    return;
  end if;

  if v_code = '' then
    raise exception 'An invite code is required to join Comp Matcher.'
      using errcode = 'check_violation';
  end if;

  update public.invites i
     set redeemed_by = p_user,
         redeemed_at = now()
   where i.code = v_code
     and i.redeemed_by is null
     and (i.expires_at is null or i.expires_at > now())
  returning i.id, i.created_by into v_invite, v_inviter;

  if not found then
    raise exception 'That invite code is not valid, or it has already been used.'
      using errcode = 'check_violation';
  end if;

  insert into public.app_members (user_id, invited_by, invite_id)
  values (p_user, v_inviter, v_invite);
end;
$$;

revoke execute on function public.claim_invite(uuid, text) from public;
revoke execute on function public.claim_invite(uuid, text) from anon;
revoke execute on function public.claim_invite(uuid, text) from authenticated;

-- ---------------------------------------------------------------------------
-- redeem_invite(): the caller-facing wrapper. Used by (auth)/invite.tsx when a
-- session exists but has no membership.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.claim_invite((select auth.uid()), p_code);
end;
$$;

revoke execute on function public.redeem_invite(text) from public;
revoke execute on function public.redeem_invite(text) from anon;
grant  execute on function public.redeem_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- my_invites_remaining(): how many more codes the caller may mint.
--   -1 means unlimited (admins). Quota counts every code the caller has
--   created, redeemed or not — deleting an unredeemed code frees the slot
--   back up, so the cap is "3 outstanding-or-used invitations at a time".
-- ---------------------------------------------------------------------------
create or replace function public.my_invites_remaining()
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_quota int;
  v_used  int;
begin
  if v_uid is null then
    return 0;
  end if;

  if exists (select 1 from public.admin_users a where a.user_id = v_uid) then
    return -1;
  end if;

  select m.invite_quota into v_quota
  from public.app_members m
  where m.user_id = v_uid;

  if v_quota is null then      -- not a member: no invites to give
    return 0;
  end if;

  select count(*) into v_used
  from public.invites i
  where i.created_by = v_uid;

  return greatest(v_quota - v_used, 0);
end;
$$;

revoke execute on function public.my_invites_remaining() from public;
revoke execute on function public.my_invites_remaining() from anon;
grant  execute on function public.my_invites_remaining() to authenticated;

-- ---------------------------------------------------------------------------
-- create_invite(): mint one code for the caller, enforcing the quota.
--   The alphabet drops I, L, O, 0 and 1 so a code read aloud or typed from a
--   screenshot is unambiguous. 10 chars over 31 symbols is ~2^49 — far past
--   guessable, which matters because holding a code is the whole credential.
-- ---------------------------------------------------------------------------
create or replace function public.create_invite()
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_row      public.invites;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from public.app_members m where m.user_id = v_uid) then
    raise exception 'Only members can create invites.'
      using errcode = 'check_violation';
  end if;

  if public.my_invites_remaining() = 0 then
    raise exception 'You have used all of your invites.'
      using errcode = 'check_violation';
  end if;

  -- Retry on the (vanishingly unlikely) unique collision rather than failing
  -- the caller's click.
  for v_attempt in 1..5 loop
    v_code := '';
    for v_char in 1..10 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    begin
      insert into public.invites (code, created_by)
      values (v_code, v_uid)
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      -- try another code
    end;
  end loop;

  raise exception 'Could not generate an invite code, please try again.';
end;
$$;

revoke execute on function public.create_invite() from public;
revoke execute on function public.create_invite() from anon;
grant  execute on function public.create_invite() to authenticated;

-- ---------------------------------------------------------------------------
-- hook_require_invite(): Supabase Auth `before_user_created` hook.
--   Returns '{}' to allow, or an error object to reject with a message the
--   client surfaces verbatim on the sign-up screen.
--
--   NOTE the deliberate hole: when the payload carries no `invite_code` key at
--   all, the signup is ALLOWED. That is the service-role path —
--   scripts/create-fixtures.mjs and scripts/create-demo-profiles.mjs create
--   users through auth.admin.createUser and must keep working. Public signup
--   always sends the key (features/auth/api.ts passes it, empty string
--   included), and an empty or unknown code is rejected below. The real
--   guarantee against a hand-crafted codeless signup is profiles_insert, not
--   this hook.
-- ---------------------------------------------------------------------------
create or replace function public.hook_require_invite(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(event->'user'->'user_metadata', '{}'::jsonb);
  v_code text;
begin
  if not (v_meta ? 'invite_code') then
    return '{}'::jsonb;                     -- service-role user creation
  end if;

  v_code := public.normalize_invite_code(v_meta->>'invite_code');

  if v_code <> '' and exists (
    select 1 from public.invites i
    where i.code = v_code
      and i.redeemed_by is null
      and (i.expires_at is null or i.expires_at > now())
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Comp Matcher is invite only. You need a valid invite code to sign up.'
    )
  );
end;
$$;

-- Hook plumbing per the Supabase auth-hooks docs: only the auth server may
-- call it, and it is never reachable through the Data API. It needs no RLS
-- policy of its own — SECURITY DEFINER runs it as the table owner, which
-- bypasses RLS on invites.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_require_invite(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_require_invite(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user_invite(): consume the code as part of the signup itself.
--   No invite_code in the metadata -> just record membership. That branch is
--   reached only by service-role user creation (the hook rejects codeless
--   public signups), and it is what keeps the fixture scripts working.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'invite_code' then
    perform public.claim_invite(new.id, new.raw_user_meta_data->>'invite_code');
  else
    insert into public.app_members (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_claim_invite
  after insert on auth.users
  for each row execute function public.handle_new_user_invite();
