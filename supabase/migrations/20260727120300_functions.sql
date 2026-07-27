-- ============================================================================
-- Comp Matcher — Read functions: get_my_profile_id(), get_deck()
-- ============================================================================
-- Both are SECURITY INVOKER: they run with the caller's privileges so RLS still
-- applies. That is intentional — the deck only ever needs data the caller is
-- already allowed to see (public entries/profiles + the caller's OWN swipes and
-- matches). No SECURITY DEFINER escalation is needed or wanted here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- get_my_profile_id(): the caller's profile id, or NULL if none.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_profile_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- get_deck(p_contest_id): swipeable candidates for the caller in a contest.
--   Candidate entries where, relative to the caller's own entry in the contest:
--     * same contest,
--     * same division as the caller's entry,
--     * opposite dance role,
--     * not the caller's own profile,
--     * the caller has NOT already swiped them in this contest,
--     * the caller is NOT already matched with them in this contest.
--   Returns zero rows if the caller has no entry in the contest.
-- ---------------------------------------------------------------------------
create or replace function public.get_deck(p_contest_id uuid)
returns table (
  entry_id     uuid,
  profile_id   uuid,
  display_name text,
  photo_url    text,
  bio          text,
  "values"     text[],
  division     public.division,
  note         text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select pr.id as profile_id, pr.role as role, e.division as division
    from public.profiles pr
    join public.entries e
      on e.profile_id = pr.id
     and e.contest_id = p_contest_id
    where pr.user_id = (select auth.uid())
  )
  select
    e.id           as entry_id,
    p.id           as profile_id,
    p.display_name,
    p.photo_url,
    p.bio,
    p."values",
    e.division,
    e.note
  from me
  join public.entries e
    on e.contest_id = p_contest_id
   and e.division   = me.division
  join public.profiles p
    on p.id   = e.profile_id
   and p.role <> me.role          -- opposite role (dance_role has exactly two values)
   and p.id  <> me.profile_id     -- never show the caller their own entry
  where not exists (              -- not already swiped by the caller in this contest
    select 1
    from public.swipes s
    where s.contest_id        = p_contest_id
      and s.swiper_profile_id = me.profile_id
      and s.target_profile_id = p.id
  )
  and not exists (                -- not already matched with the caller in this contest
    select 1
    from public.matches m
    where m.contest_id = p_contest_id
      and (
        (m.profile_a = me.profile_id and m.profile_b = p.id)
        or (m.profile_b = me.profile_id and m.profile_a = p.id)
      )
  );
$$;

-- RPC-callable read functions: grant to authenticated (see rls migration note
-- on why explicit grants are required under the new default).
grant execute on function public.get_my_profile_id()   to authenticated;
grant execute on function public.get_deck(uuid)         to authenticated;
