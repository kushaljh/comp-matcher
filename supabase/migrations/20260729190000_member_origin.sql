-- ============================================================================
-- Comp Matcher — Record how each member got in
-- ============================================================================
-- The admin roster inferred it: `invited_by_name ?? 'Founding member'`. That
-- label was doing three jobs, and getting two of them wrong.
--
--   1. Genuinely grandfathered accounts — here before invite-only existed.
--      Correct.
--   2. Accounts created service-side (fixtures, the demo dancers,
--      auth.admin.createUser). Not founders; seeds.
--   3. WORST: a member who joined with a code whose INVITER has since deleted
--      their account. app_members.invited_by and invite_id are both
--      ON DELETE SET NULL — rightly, so a departure does not cascade into
--      other people's rows — but that makes an invited member indistinguishable
--      from a founder. The invite trail quietly rewrote itself, which is
--      exactly the record an invite-only community keeps in order to know who
--      vouched for whom.
--
-- Same shape of bug as the redeemed_by one in
-- 20260729160000_invite_single_use_fix.sql: a fact was being read off a column
-- that a foreign key is allowed to blank. The fix is the same — put the fact
-- in a column nothing nulls.
--
-- Deliberately NOT denormalising the inviter's NAME here. Keeping a departed
-- person's display name attached to somebody else's row outlives the account
-- deletion they asked for. `origin` records that they were invited, which is
-- what the community needs; the panel says "by an account since deleted"
-- rather than naming them.
-- ============================================================================

alter table public.app_members
  add column origin text not null default 'seeded'
    check (origin in ('grandfathered', 'invited', 'seeded'));

comment on column public.app_members.origin is
  'How this member got in. Set once at insert and never nulled by a cascade, unlike invited_by/invite_id.';

-- Every row that exists today came from the invite-only backfill, which took
-- everyone who predated the gate. Some are seed accounts, but all of them were
-- here before invites, and guessing which is which would be inventing history.
update public.app_members set origin = 'grandfathered';

-- ---------------------------------------------------------------------------
-- claim_invite(): the invited path says so.
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
     and i.redeemed_at is null
     and (i.expires_at is null or i.expires_at > now())
  returning i.id, i.created_by into v_invite, v_inviter;

  if not found then
    raise exception 'That invite code is not valid, or it has already been used.'
      using errcode = 'check_violation';
  end if;

  insert into public.app_members (user_id, invited_by, invite_id, origin)
  values (p_user, v_inviter, v_invite, 'invited');
end;
$$;

revoke execute on function public.claim_invite(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The trigger's codeless branch is the service-role path: seeded, not founding.
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
    insert into public.app_members (user_id, origin)
    values (new.id, 'seeded')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The roster reports it, so the panel stops guessing.
--
-- Dropped first: adding an OUT column changes the row type, and CREATE OR
-- REPLACE cannot do that ("cannot change return type of existing function").
-- ---------------------------------------------------------------------------
drop function public.admin_dancer_roster();

create function public.admin_dancer_roster()
returns table (
  profile_id        uuid,
  user_id           uuid,
  display_name      text,
  email             text,
  photo_url         text,
  city              text,
  country           text,
  suspended_at      timestamptz,
  signed_up_at      timestamptz,
  onboarded_at      timestamptz,
  joined_at         timestamptz,
  origin            text,
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
    u.email::text,
    p.photo_url,
    p.city,
    p.country,
    p.suspended_at,
    u.created_at,
    p.created_at,
    m.joined_at,
    coalesce(m.origin, 'seeded'),
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
