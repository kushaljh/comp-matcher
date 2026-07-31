-- ============================================================================
-- Comp Matcher — Admins can see how to reach a dancer
-- ============================================================================
-- Two additions to the admin roster, and they are not equivalent.
--
-- 1. EMAIL. Every account has one — it is the login credential, and signup is
--    email + password with no usernames — but auth.users.email has never been
--    exposed to the client anywhere in this project. A dancer sees their own
--    in Settings because it rides on their session JWT; nobody could look up
--    anyone else's. Handing it to admins is ordinary: it is how you work out
--    which account a person emailing you actually is. It also makes the
--    roster searchable by the thing people identify themselves with.
--
-- 2. CONTACT HANDLES. These are different, and worth being explicit about.
--    profile_contacts is deliberately match-gated: profile_contacts_select
--    lets you read someone's Instagram or WhatsApp only if you are that
--    someone, or if the two of you have matched. Dancers add them on the
--    understanding that they are exchanged when a pairing forms, not browsed.
--    Showing them to admins changes that promise.
--
--    It is a defensible change for someone running the community — an
--    organiser fielding a complaint needs a way to reach both sides — so it
--    is made here deliberately rather than by accident, and it is made as
--    narrowly as the shape allows:
--      * a SEPARATE function, not extra columns on the roster, so contacts
--        are fetched only for the one dancer an admin actually opens rather
--        than bulk-loaded for everybody on every page view;
--      * still no new POLICY on profile_contacts, so the match gate is
--        untouched for every non-admin caller and for every other code path.
--
--    What is still NOT visible to admins, and stays that way: who swiped on
--    whom, and who matched with whom. Suspension can be decided from the
--    roster; the deck and the dance card remain private.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin_dancer_roster(): + email
-- ---------------------------------------------------------------------------
create or replace function public.admin_dancer_roster()
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
-- admin_dancer_contacts(): one dancer's handles, on demand.
--
-- Separate from the roster on purpose — see the header. The admin panel calls
-- this only when a dancer's details are expanded, so an admin who never opens
-- anyone never reads anyone's handles.
-- ---------------------------------------------------------------------------
create or replace function public.admin_dancer_contacts(p_profile_id uuid)
returns table (
  platform public.contact_platform,
  handle   text
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
  select c.platform, c.handle
  from public.profile_contacts c
  where c.profile_id = p_profile_id
  order by c.platform;
end;
$$;

revoke execute on function public.admin_dancer_contacts(uuid) from public, anon;
grant  execute on function public.admin_dancer_contacts(uuid) to authenticated;
