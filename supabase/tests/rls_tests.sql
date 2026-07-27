-- ============================================================================
-- Comp Matcher — RLS / privacy regression tests
-- ----------------------------------------------------------------------------
-- Run against a database that already has the migrations applied:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_tests.sql
--
-- The whole thing runs in one transaction and ROLLBACKs at the end, so it
-- leaves no rows behind. Setup runs as the connection role (postgres, which
-- bypasses RLS). Each test then simulates a client by setting the JWT claims
-- and switching to the `authenticated`/`anon` role, exactly like PostgREST.
--
-- Any failed assertion RAISEs, and with ON_ERROR_STOP=1 psql exits non-zero
-- before printing the final success banner.
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Fixed test UUIDs
--   users:    uA leader, uB follower, uC follower(adv), uD leader
--   profiles: pA, pB, pC, pD
--   event:    evApproved (approved), evPending (pending, suggested_by uB)
--   contest:  ct1 under evApproved, divisions {novice, advanced}
-- ---------------------------------------------------------------------------
-- auth users (only `id` is strictly required; extra cols keep GoTrue happy)
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-a000-0000000000a1', 'authenticated', 'authenticated', 'rls_a@test.local', now(), now()),
  ('00000000-0000-4000-a000-0000000000b1', 'authenticated', 'authenticated', 'rls_b@test.local', now(), now()),
  ('00000000-0000-4000-a000-0000000000c1', 'authenticated', 'authenticated', 'rls_c@test.local', now(), now()),
  ('00000000-0000-4000-a000-0000000000d1', 'authenticated', 'authenticated', 'rls_d@test.local', now(), now());

insert into public.profiles (id, user_id, display_name, role) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000a1', 'Test A (leader)',   'leader'),
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-0000000000b1', 'Test B (follower)', 'follower'),
  ('00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-a000-0000000000c1', 'Test C (follower)', 'follower'),
  ('00000000-0000-4000-b000-0000000000d1', '00000000-0000-4000-a000-0000000000d1', 'Test D (leader)',   'leader');

-- B has two contacts (used by the contacts-visibility test)
insert into public.profile_contacts (profile_id, platform, handle) values
  ('00000000-0000-4000-b000-0000000000b1', 'instagram', '@test_b'),
  ('00000000-0000-4000-b000-0000000000b1', 'email',     'b@test.local');

insert into public.events (id, name, location, start_date, end_date, status, suggested_by) values
  ('00000000-0000-4000-c000-000000000001', 'Approved Event', 'Somewhere', '2027-03-01', '2027-03-03', 'approved', null),
  ('00000000-0000-4000-c000-000000000002', 'Pending Event',  'Elsewhere', '2027-04-01', '2027-04-03', 'pending',  '00000000-0000-4000-a000-0000000000b1');

insert into public.contests (id, event_id, name, divisions) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000001', 'Test Contest',
   array['novice','advanced']::public.division[]);

-- entries: A novice, B novice, C advanced, D novice (all in ct1)
insert into public.entries (profile_id, contest_id, division) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-d000-000000000001', 'novice'),
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-d000-000000000001', 'novice'),
  ('00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-d000-000000000001', 'advanced'),
  ('00000000-0000-4000-b000-0000000000d1', '00000000-0000-4000-d000-000000000001', 'novice');

-- B passes on A (a 'pass' so A liking B later does NOT create a match)
insert into public.swipes (contest_id, swiper_profile_id, target_profile_id, direction) values
  ('00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-b000-0000000000b1',
   '00000000-0000-4000-b000-0000000000a1',
   'pass');

-- ===========================================================================
-- TEST 3 — event visibility (approved vs pending vs anon)
-- ===========================================================================
-- As A (non-suggester): approved visible, pending invisible.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n_appr int; n_pend int;
begin
  select count(*) into n_appr from public.events where id = '00000000-0000-4000-c000-000000000001';
  select count(*) into n_pend from public.events where id = '00000000-0000-4000-c000-000000000002';
  if n_appr <> 1 then raise exception 'TEST 3 FAIL: A cannot see approved event (got %)', n_appr; end if;
  if n_pend <> 0 then raise exception 'TEST 3 FAIL: A can see pending event they did not suggest (got %)', n_pend; end if;
end $$;
reset role;

-- As B (the suggester): pending event IS visible.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n_pend int;
begin
  select count(*) into n_pend from public.events where id = '00000000-0000-4000-c000-000000000002';
  if n_pend <> 1 then raise exception 'TEST 3 FAIL: suggester B cannot see own pending event (got %)', n_pend; end if;
end $$;
reset role;

-- As anon: sees nothing (policies are authenticated-only; anon lacks grants too).
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.events;
    if n <> 0 then raise exception 'TEST 3 FAIL: anon can read % events', n; end if;
  exception when insufficient_privilege then
    null; -- anon has no grant at all: an even stronger denial, acceptable
  end;
end $$;
reset role;

-- ===========================================================================
-- TEST 4 — A cannot insert a swipe using someone else's profile as swiper
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare blocked boolean := false; st text;
begin
  begin
    insert into public.swipes (contest_id, swiper_profile_id, target_profile_id, direction)
    values ('00000000-0000-4000-d000-000000000001',
            '00000000-0000-4000-b000-0000000000b1',   -- B's profile (not A's)
            '00000000-0000-4000-b000-0000000000c1',   -- target C (no existing swipe -> only RLS can block)
            'pass');
  exception when others then
    blocked := true; st := sqlstate;
  end;
  if not blocked then
    raise exception 'TEST 4 FAIL: A inserted a swipe with a foreign swiper profile';
  end if;
  if st <> '42501' then
    raise exception 'TEST 4 FAIL: swipe insert blocked but not by RLS (sqlstate=%)', st;
  end if;
end $$;
reset role;

-- ===========================================================================
-- TEST 5 — A cannot insert into matches directly
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare blocked boolean := false; st text;
begin
  begin
    insert into public.matches (contest_id, profile_a, profile_b)
    values ('00000000-0000-4000-d000-000000000001',
            '00000000-0000-4000-b000-0000000000a1',   -- ordered pA < pB so the CHECK passes
            '00000000-0000-4000-b000-0000000000b1');
  exception when others then
    blocked := true; st := sqlstate;
  end;
  if not blocked then
    raise exception 'TEST 5 FAIL: A inserted directly into matches';
  end if;
  if st <> '42501' then
    raise exception 'TEST 5 FAIL: matches insert blocked but not by RLS/grant (sqlstate=%)', st;
  end if;
end $$;
reset role;

-- ===========================================================================
-- TEST 1 — swipes are invisible to their targets and to third parties
--   B swiped A (setup). As A, A must NOT be able to read any swipe that
--   targets A, nor any swipe made by B.
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n_targeting_me int; n_by_b int;
begin
  select count(*) into n_targeting_me
    from public.swipes where target_profile_id = '00000000-0000-4000-b000-0000000000a1';
  select count(*) into n_by_b
    from public.swipes where swiper_profile_id = '00000000-0000-4000-b000-0000000000b1';
  if n_targeting_me <> 0 then
    raise exception 'TEST 1 FAIL: A can see % swipe(s) targeting A (must be 0)', n_targeting_me;
  end if;
  if n_by_b <> 0 then
    raise exception 'TEST 1 FAIL: A can see % swipe(s) made by B (must be 0)', n_by_b;
  end if;
end $$;
reset role;

-- ===========================================================================
-- TEST 6 — get_deck() respects role-opposite + same-division + not-swiped
--   As A (leader, novice) the deck must be exactly {B} (follower, novice):
--     C excluded (advanced -> wrong division), D excluded (leader -> same role).
--   After A likes B, B must drop out of A's deck (not-swiped filter).
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n_total int;
  has_b boolean;
  has_c boolean;
  has_d boolean;
begin
  select count(*),
         bool_or(profile_id = '00000000-0000-4000-b000-0000000000b1'),
         bool_or(profile_id = '00000000-0000-4000-b000-0000000000c1'),
         bool_or(profile_id = '00000000-0000-4000-b000-0000000000d1')
    into n_total, has_b, has_c, has_d
    from public.get_deck('00000000-0000-4000-d000-000000000001');

  if n_total <> 1 then raise exception 'TEST 6 FAIL: deck should have exactly 1 candidate, got %', n_total; end if;
  if not coalesce(has_b, false) then raise exception 'TEST 6 FAIL: deck missing B (opposite role, same division)'; end if;
  if coalesce(has_c, false) then raise exception 'TEST 6 FAIL: deck includes C (advanced -> wrong division)'; end if;
  if coalesce(has_d, false) then raise exception 'TEST 6 FAIL: deck includes D (leader -> same role)'; end if;

  -- A likes B (real insert as A). B previously PASSED on A, so no match forms.
  insert into public.swipes (contest_id, swiper_profile_id, target_profile_id, direction)
  values ('00000000-0000-4000-d000-000000000001',
          '00000000-0000-4000-b000-0000000000a1',
          '00000000-0000-4000-b000-0000000000b1',
          'like');

  -- B must now be gone from A's deck.
  select count(*) into n_total from public.get_deck('00000000-0000-4000-d000-000000000001');
  if n_total <> 0 then raise exception 'TEST 6 FAIL: swiped candidate B still in deck (got % rows)', n_total; end if;
end $$;
reset role;

-- ===========================================================================
-- TEST 2 — contact visibility flips on match
--   Before any match, A cannot see B's contacts. After a match row exists
--   between A and B, A can.
-- ===========================================================================
-- Before match: A sees 0 of B's contacts.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.profile_contacts
   where profile_id = '00000000-0000-4000-b000-0000000000b1';
  if n <> 0 then raise exception 'TEST 2 FAIL: A can see B contacts while unmatched (got %)', n; end if;
end $$;
reset role;

-- Create the match as postgres (bypasses RLS) — pA < pB so ordering is valid.
insert into public.matches (contest_id, profile_a, profile_b) values
  ('00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-b000-0000000000a1',
   '00000000-0000-4000-b000-0000000000b1');

-- After match: A sees B's 2 contacts.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.profile_contacts
   where profile_id = '00000000-0000-4000-b000-0000000000b1';
  if n <> 2 then raise exception 'TEST 2 FAIL: matched A should see B''s 2 contacts, got %', n; end if;
end $$;
reset role;

rollback;

\echo 'ALL RLS TESTS PASSED'
