-- ============================================================================
-- Comp Matcher — values preset cleanup + local scene
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Values presets
--
-- The tap-to-add list in features/auth/constants.ts changed: "exposure" became
-- "competition exposure", "social fun" and "yolo" were dropped, "performing"
-- was added.
--
-- Editing that constant is NOT enough. `profiles.values` is free-text text[],
-- and ValuesField renders whatever is stored rather than only what the preset
-- list contains. Without this backfill:
--   * a profile holding 'exposure' would show it as a selected chip AND be
--     offered 'competition exposure' under "Tap to add" — the same intent
--     listed twice;
--   * 'social fun' / 'yolo' would keep displaying forever, indistinguishable
--     from a value the dancer typed themselves.
--
-- Exact lowercase matching is correct here: these three strings only ever
-- entered the column from the old preset constant. A dancer who typed "yolo"
-- by hand into the custom box is indistinguishable from a preset click and
-- will also be cleared — accepted, and noted here rather than left silent.
-- ---------------------------------------------------------------------------
update public.profiles
   set "values" = array_replace("values", 'exposure', 'competition exposure')
 where 'exposure' = any ("values");

update public.profiles
   set "values" = array_remove(array_remove("values", 'social fun'), 'yolo')
 where 'social fun' = any ("values")
    or 'yolo'       = any ("values");

-- ---------------------------------------------------------------------------
-- 2) Local scene
--
-- Where a dancer is based, so a prospective partner can see whether training
-- together is even possible before committing to a pairing.
--
-- Three independently-optional columns rather than one free-text line: a Berlin
-- dancer fills city + country and leaves state null, which most of the world
-- needs. Nullable text needs no backfill and no constraint; a profile with all
-- three empty simply renders nothing.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column city    text,
  add column state   text,
  add column country text;

-- ---------------------------------------------------------------------------
-- 3) get_deck returns the location, so a card can show it without a second
--    lookup per candidate. Same body as the previous version otherwise.
--
--    Dropped and recreated rather than CREATE OR REPLACE: replace cannot widen
--    a RETURNS TABLE ("cannot change return type of existing function").
-- ---------------------------------------------------------------------------
drop function if exists public.get_deck(uuid);

create function public.get_deck(p_entry_id uuid)
returns table (
  entry_id     uuid,
  profile_id   uuid,
  display_name text,
  photo_url    text,
  bio          text,
  "values"     text[],
  division     public.division,
  role         public.dance_role,
  city         text,
  state        text,
  country      text,
  note         text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select e.profile_id, e.contest_id, e.division, e.role
    from public.entries e
    join public.profiles pr
      on pr.id      = e.profile_id
     and pr.user_id = (select auth.uid())
    where e.id = p_entry_id
  )
  select
    e.id           as entry_id,
    p.id           as profile_id,
    p.display_name,
    p.photo_url,
    p.bio,
    p."values",
    e.division,
    e.role,
    p.city,
    p.state,
    p.country,
    e.note
  from me
  join public.entries e
    on e.contest_id = me.contest_id
   and e.division   = me.division
   and e.role       = public.other_role(me.role)
   and e.profile_id <> me.profile_id
  join public.profiles p
    on p.id = e.profile_id
  where not exists (
    select 1
    from public.swipes s
    where s.contest_id        = me.contest_id
      and s.swiper_profile_id = me.profile_id
      and s.target_profile_id = p.id
      and s.swiper_role       = me.role
  )
  and not exists (
    select 1
    from public.matches m
    where m.contest_id = me.contest_id
      and (
        (m.profile_a = me.profile_id and m.profile_b = p.id
           and m.profile_a_role = me.role)
        or
        (m.profile_b = me.profile_id and m.profile_a = p.id
           and m.profile_a_role = public.other_role(me.role))
      )
  );
$$;

grant execute on function public.get_deck(uuid) to authenticated;
