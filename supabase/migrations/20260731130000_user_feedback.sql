-- ============================================================================
-- Comp Matcher — a way for dancers to tell us something
-- ============================================================================
-- Until now the only feedback path out of the app was openSupportEmail(), which
-- throws people at a mailto: link and is only reachable from the suspended
-- screen. Mail is not triageable: nobody can see what is outstanding, and none
-- of it sits next to the rest of the admin panel.
--
-- So: a note is a row. A dancer picks a category and writes a message; admins
-- read every note and mark it resolved. Two decisions worth stating up front,
-- because the rest of this file follows from them:
--
--   1. Feedback is FIRE AND FORGET for the sender. There is no select policy
--      for authors — a dancer cannot read back even their own note. That is the
--      whole reason the client's insert must not ask for the row back (see
--      features/feedback/api.ts); a bare insert needs nothing but the insert
--      policy, and asking for a return value would fail RLS.
--
--   2. Identity is DENORMALISED onto the row, the same way admin_actions does
--      it. A complaint whose author can erase it by deleting their account is
--      worth less than one that outlives them, and an admin reading a six-week
--      old bug report still wants to know who hit it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The vocabulary. Three categories is enough to sort a queue by; more would
--    just make people stop and think about which box their sentence goes in.
-- ---------------------------------------------------------------------------
create type public.feedback_category as enum ('bug', 'idea', 'other');

-- 'new' -> 'resolved', and back again. Not 'open'/'closed': an admin marking
-- something resolved is saying they dealt with it, not that they shut a ticket.
create type public.feedback_status as enum ('new', 'resolved');

-- ---------------------------------------------------------------------------
-- 2) The table
-- ---------------------------------------------------------------------------
create table public.feedback (
  id           uuid primary key default gen_random_uuid(),
  -- Who wrote it. ON DELETE SET NULL for the reason admin_actions gives: the
  -- record has to survive the account, or it is not a record.
  author       uuid references auth.users (id) on delete set null,
  author_email text,                    -- stamped at insert, survives the account
  author_name  text,                    -- display_name at the time of writing
  category     public.feedback_category not null,
  message      text not null,
  status       public.feedback_status not null default 'new',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id) on delete set null
);

-- The panel reads newest-first and partitions on status; both are indexed.
create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_status_idx  on public.feedback (status);

alter table public.feedback enable row level security;

-- Anyone signed in may write a note, attributed to themselves and landing
-- unresolved. Same shape as events_insert in 20260727120100_rls.sql: the WITH
-- CHECK is what makes those two facts true, not the client's good manners.
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (
    author = (select auth.uid())
    and status = 'new'
  );

-- Admins read everything. There is deliberately no author-side select policy,
-- so for everyone else this table reads as empty — including for the person who
-- just wrote a row. Nothing an admin DOES to a note goes through a policy
-- either: see the RPC below.
create policy feedback_admin_select on public.feedback
  for select to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = (select auth.uid())
    )
  );

grant select, insert on public.feedback to authenticated;
grant all           on public.feedback to service_role;

-- ---------------------------------------------------------------------------
-- 3) Stamp the author's identity at insert. SECURITY DEFINER for the same
--    reason flag_test_profile() is (20260731120000_test_account_badge.sql):
--    the inserting client's role cannot read auth.users and must not be able
--    to. This only ever looks up the row being inserted, whose author the
--    insert policy has already pinned to the caller.
-- ---------------------------------------------------------------------------
create function public.stamp_feedback_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select u.email into new.author_email
  from auth.users u where u.id = new.author;

  select p.display_name into new.author_name
  from public.profiles p where p.user_id = new.author;

  return new;
end;
$$;

revoke execute on function public.stamp_feedback_author() from public;

create trigger feedback_stamp_author
  before insert on public.feedback
  for each row execute function public.stamp_feedback_author();

-- ---------------------------------------------------------------------------
-- 4) admin_set_feedback_status() — the only thing an admin can DO to a note.
--
--    A function rather than an admin UPDATE policy, for the reason every other
--    admin capability here gives: RLS cannot restrict WHICH COLUMNS a policy
--    covers, so a policy broad enough to flip `status` would also let an admin
--    rewrite the message someone sent them. This touches status, resolved_at
--    and resolved_by, and nothing else.
-- ---------------------------------------------------------------------------
create function public.admin_set_feedback_status(
  p_id     uuid,
  p_status public.feedback_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_author   uuid;
  v_name     text;
  v_category public.feedback_category;
begin
  if not exists (
    select 1 from public.admin_users a
    where a.user_id = v_uid
  ) then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;

  update public.feedback
     set status      = p_status,
         resolved_at = case when p_status = 'resolved' then now() else null end,
         resolved_by = case when p_status = 'resolved' then v_uid else null end
   where id = p_id
  returning author, author_name, category into v_author, v_name, v_category;

  if not found then
    raise exception 'no such feedback' using errcode = 'no_data_found';
  end if;

  perform public.log_admin_action(
    case when p_status = 'resolved' then 'resolve_feedback' else 'reopen_feedback' end,
    v_author, v_name,
    jsonb_build_object('feedback_id', p_id, 'category', v_category)
  );
end;
$$;

revoke execute on function public.admin_set_feedback_status(uuid, public.feedback_status) from public, anon;
grant  execute on function public.admin_set_feedback_status(uuid, public.feedback_status) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) The landing page learns to count unread notes. CREATE OR REPLACE — the
--    return type is jsonb, so adding a key changes nothing about the signature;
--    the body is otherwise verbatim from 20260729160000_invite_single_use_fix.sql.
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
    'can_invite',         (select count(*) from public.app_members where invite_quota > 0),
    'feedback_new',       (select count(*) from public.feedback where status = 'new')
  );
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant  execute on function public.admin_overview() to authenticated;
