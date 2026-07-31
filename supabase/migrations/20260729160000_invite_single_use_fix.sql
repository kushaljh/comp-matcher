-- ============================================================================
-- Comp Matcher — A spent invite must stay spent
-- ============================================================================
-- Bug, found by testing what happens when accounts go away.
--
-- invites.redeemed_by references auth.users ON DELETE SET NULL, which is right:
-- a departing member must not drag the invite record out of the table with
-- them. But "is this code still available?" was asked as `redeemed_by is null`
-- in claim_invite() and hook_require_invite() — and that is exactly the column
-- the FK nulls out.
--
-- So: someone joins with a code, then deletes their account (delete_my_account()
-- is a normal, one-tap, user-facing action). redeemed_by goes null, and the
-- code is live again. Anyone still holding it — the inviter, a screenshot, a
-- group chat, the person who just left — walks straight back in, and the new
-- signup is attributed to nobody. For an invite-only app that is the whole
-- gate quietly reopening, months after the fact, with no trace.
--
-- The fix is to ask the question of a column nothing nulls: redeemed_at. It is
-- set in the same statement as redeemed_by and has no FK action on it, so it
-- survives the redeemer's departure and remains the honest record that this
-- code was used once. Both columns are still written; only the TEST changes.
--
-- Callers keep reading redeemed_by for "who used it" — that is what it is for,
-- and null there now correctly means "used by an account that no longer
-- exists" rather than "never used".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- claim_invite(): the consume. Unchanged except for the availability test.
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
     and i.redeemed_at is null            -- <- not redeemed_by: see header
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

revoke execute on function public.claim_invite(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- hook_require_invite(): the same question, asked at the door.
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
      and i.redeemed_at is null             -- <- not redeemed_by: see header
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

grant execute on function public.hook_require_invite(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_require_invite(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- invites_delete: a member may withdraw a code nobody has used. Same column,
-- same reason — otherwise a code someone joined with becomes deletable once
-- that person leaves, erasing the record of how they got in.
-- ---------------------------------------------------------------------------
drop policy invites_delete on public.invites;

create policy invites_delete on public.invites
  for delete to authenticated
  using (created_by = (select auth.uid()) and redeemed_at is null);

-- ---------------------------------------------------------------------------
-- The counts admins read. "Outstanding" must not include a code that was used
-- by someone who has since left, or the panel would invite them to re-share it.
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
    'invites_outstanding',(select count(*) from public.invites where redeemed_at is null),
    'invites_claimed',    (select count(*) from public.invites where redeemed_at is not null),
    'can_invite',         (select count(*) from public.app_members where invite_quota > 0)
  );
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant  execute on function public.admin_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Same correction in the roster's per-member tally.
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
      where i.created_by = p.user_id and i.redeemed_at is not null)
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
-- And in the audit trail's "was this code already used?" note.
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
      jsonb_build_object('claimed', old.redeemed_at is not null)
    );
  end if;
  return old;
end;
$$;
