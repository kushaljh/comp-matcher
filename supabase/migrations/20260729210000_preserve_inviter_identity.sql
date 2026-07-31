-- ============================================================================
-- Comp Matcher — Keep who vouched for whom, even after they leave
-- ============================================================================
-- 20260729190000_member_origin.sql stopped an invited member being relabelled
-- a founder when their inviter deleted their account, but it settled for
-- recording only THAT they were invited — the panel said "from an account
-- since deleted" and the name was gone.
--
-- That is the wrong trade for an invite-only community, and deliberately
-- reversing the call made in that migration's header. The reason is the abuse
-- case: someone vouches for a member who turns out to be a problem, then
-- deletes their own account. Under the old behaviour that erases the link
-- between them at precisely the moment an organiser needs it, and it is a
-- trivial thing to do on purpose. A vouching record that any voucher can
-- unilaterally delete is not a record.
--
-- So the inviter's name and email are SNAPSHOT onto the invitee's row when
-- the code is claimed. This is the same pattern admin_actions already uses
-- with actor_email and subject_label, and for the same reason: an accountability
-- trail has to outlast the accounts it describes.
--
-- Note what this does NOT do. It stores the inviter's identity on the row of
-- the person they invited — visible to admins, through admin_dancer_roster(),
-- exactly as before. It does not resurrect their profile, their contacts, or
-- anything they wrote; delete_my_account() still removes all of that.
-- ============================================================================

alter table public.app_members
  add column invited_by_name  text,
  add column invited_by_email text;

comment on column public.app_members.invited_by_name is
  'The inviter''s display name AT THE TIME OF THE INVITE. Snapshot on purpose: invited_by is ON DELETE SET NULL, so this is what survives them deleting their account.';
comment on column public.app_members.invited_by_email is
  'The inviter''s login email at the time of the invite. See invited_by_name.';

-- Any member who came through a code while the inviter still exists: capture
-- them now, so the snapshot is not only correct for invites made from here on.
update public.app_members m
   set invited_by_name  = p.display_name,
       invited_by_email = u.email::text
  from auth.users u
  left join public.profiles p on p.user_id = u.id
 where u.id = m.invited_by
   and m.invited_by_name is null;

-- ---------------------------------------------------------------------------
-- claim_invite(): take the snapshot as the invite is consumed.
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
  v_name    text;
  v_email   text;
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

  select p.display_name, u.email::text into v_name, v_email
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where u.id = v_inviter;

  insert into public.app_members
    (user_id, invited_by, invite_id, origin, invited_by_name, invited_by_email)
  values (p_user, v_inviter, v_invite, 'invited', v_name, v_email);
end;
$$;

revoke execute on function public.claim_invite(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The roster prefers the LIVE inviter (so a rename shows through) and falls
-- back to the snapshot once the account is gone.
-- ---------------------------------------------------------------------------
drop function public.admin_dancer_roster();

create function public.admin_dancer_roster()
returns table (
  profile_id         uuid,
  user_id            uuid,
  display_name       text,
  email              text,
  photo_url          text,
  city               text,
  country            text,
  suspended_at       timestamptz,
  signed_up_at       timestamptz,
  onboarded_at       timestamptz,
  joined_at          timestamptz,
  origin             text,
  invited_by_name    text,
  invited_by_email   text,
  inviter_still_here boolean,
  invite_quota       int,
  invites_created    int,
  invites_claimed    int
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
    coalesce(inviter.display_name, m.invited_by_name),
    coalesce(inviter_user.email::text, m.invited_by_email),
    (m.invited_by is not null),
    coalesce(m.invite_quota, 0),
    (select count(*)::int from public.invites i where i.created_by = p.user_id),
    (select count(*)::int from public.invites i
      where i.created_by = p.user_id and i.redeemed_at is not null)
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.app_members m on m.user_id = p.user_id
  left join auth.users inviter_user on inviter_user.id = m.invited_by
  left join public.profiles inviter on inviter.user_id = m.invited_by
  order by p.display_name;
end;
$$;

revoke execute on function public.admin_dancer_roster() from public, anon;
grant  execute on function public.admin_dancer_roster() to authenticated;
