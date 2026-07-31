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

-- Role lives on the ENTRY now, so the profile names keep the old labels only as
-- a reading aid for the assertions below.
insert into public.profiles (id, user_id, display_name) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-a000-0000000000a1', 'Test A (leader)'),
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-a000-0000000000b1', 'Test B (follower)'),
  ('00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-a000-0000000000c1', 'Test C (follower)'),
  ('00000000-0000-4000-b000-0000000000d1', '00000000-0000-4000-a000-0000000000d1', 'Test D (leader)');

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

-- entries: A novice lead, B novice follow, C advanced follow, D novice lead.
-- Explicit ids because get_deck() is keyed by ENTRY now, not contest.
insert into public.entries (id, profile_id, contest_id, division, role) values
  ('00000000-0000-4000-e000-0000000000a1', '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-d000-000000000001', 'novice',   'leader'),
  ('00000000-0000-4000-e000-0000000000b1', '00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-d000-000000000001', 'novice',   'follower'),
  ('00000000-0000-4000-e000-0000000000c1', '00000000-0000-4000-b000-0000000000c1', '00000000-0000-4000-d000-000000000001', 'advanced', 'follower'),
  ('00000000-0000-4000-e000-0000000000d1', '00000000-0000-4000-b000-0000000000d1', '00000000-0000-4000-d000-000000000001', 'novice',   'leader');

-- B passes on A (a 'pass' so A liking B later does NOT create a match)
insert into public.swipes (contest_id, swiper_profile_id, target_profile_id, direction, swiper_role) values
  ('00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-b000-0000000000b1',
   '00000000-0000-4000-b000-0000000000a1',
   'pass',
   'follower');

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
    insert into public.swipes (contest_id, swiper_profile_id, target_profile_id, direction, swiper_role)
    values ('00000000-0000-4000-d000-000000000001',
            '00000000-0000-4000-b000-0000000000b1',   -- B's profile (not A's)
            '00000000-0000-4000-b000-0000000000c1',   -- target C (no existing swipe -> only RLS can block)
            'pass',
            'follower');                              -- B's actual entry role
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
    insert into public.matches (contest_id, profile_a, profile_b, profile_a_role)
    values ('00000000-0000-4000-d000-000000000001',
            '00000000-0000-4000-b000-0000000000a1',   -- ordered pA < pB so the CHECK passes
            '00000000-0000-4000-b000-0000000000b1',
            'leader');
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
    from public.get_deck('00000000-0000-4000-e000-0000000000a1');

  if n_total <> 1 then raise exception 'TEST 6 FAIL: deck should have exactly 1 candidate, got %', n_total; end if;
  if not coalesce(has_b, false) then raise exception 'TEST 6 FAIL: deck missing B (opposite role, same division)'; end if;
  if coalesce(has_c, false) then raise exception 'TEST 6 FAIL: deck includes C (advanced -> wrong division)'; end if;
  if coalesce(has_d, false) then raise exception 'TEST 6 FAIL: deck includes D (leader -> same role)'; end if;

  -- A likes B (real insert as A). B previously PASSED on A, so no match forms.
  insert into public.swipes (contest_id, swiper_profile_id, target_profile_id, direction, swiper_role)
  values ('00000000-0000-4000-d000-000000000001',
          '00000000-0000-4000-b000-0000000000a1',
          '00000000-0000-4000-b000-0000000000b1',
          'like',
          'leader');

  -- B must now be gone from A's deck.
  select count(*) into n_total from public.get_deck('00000000-0000-4000-e000-0000000000a1');
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
insert into public.matches (contest_id, profile_a, profile_b, profile_a_role) values
  ('00000000-0000-4000-d000-000000000001',
   '00000000-0000-4000-b000-0000000000a1',
   '00000000-0000-4000-b000-0000000000b1',
   'leader');

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

-- ===========================================================================
-- TEST 7 — invite-only access
--   uE is a brand-new auth user created WITHOUT an invite_code, so the
--   on_auth_user_created_claim_invite trigger grants membership (the
--   service-role seeding path). uF is created and then has its membership
--   removed, standing in for an uninvited session.
-- ===========================================================================
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-a000-0000000000e1', 'authenticated', 'authenticated', 'rls_e@test.local', now(), now()),
  ('00000000-0000-4000-a000-0000000000f1', 'authenticated', 'authenticated', 'rls_f@test.local', now(), now());

do $$
declare n int;
begin
  select count(*) into n from public.app_members
   where user_id in ('00000000-0000-4000-a000-0000000000e1',
                     '00000000-0000-4000-a000-0000000000f1');
  if n <> 2 then raise exception 'TEST 7 FAIL: trigger did not grant membership on codeless insert (got %)', n; end if;
end $$;

-- F is the uninvited one from here on.
delete from public.app_members where user_id = '00000000-0000-4000-a000-0000000000f1';

-- 7a. A member CAN create their profile; a non-member cannot.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  insert into public.profiles (user_id, display_name)
  values ('00000000-0000-4000-a000-0000000000e1', 'Test E (member)');
exception when others then
  raise exception 'TEST 7 FAIL: member E could not create a profile (%)', sqlerrm;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into public.profiles (user_id, display_name)
    values ('00000000-0000-4000-a000-0000000000f1', 'Test F (uninvited)');
    raise exception 'TEST 7 FAIL: uninvited F created a profile';
  exception when insufficient_privilege then
    null;  -- expected: profiles_insert requires an app_members row
  end;
end $$;
reset role;

-- 7b. app_members is own-row only.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.app_members;
  if n <> 1 then raise exception 'TEST 7 FAIL: E can see % app_members rows, expected only their own', n; end if;
end $$;
reset role;

-- 7c. create_invite() respects the quota, and the codes belong to the caller.
--     Members start at quota 0 since 20260729140000_admin_panel.sql — inviting
--     is granted, not given — so E is granted 3 first. TEST 8 covers the
--     ungranted case and the admin grant path itself.
update public.app_members set invite_quota = 3
 where user_id = '00000000-0000-4000-a000-0000000000e1';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_code text;
  n int;
begin
  if public.my_invites_remaining() <> 3 then
    raise exception 'TEST 7 FAIL: fresh member should have 3 invites, got %', public.my_invites_remaining();
  end if;

  for i in 1..3 loop
    v_code := (public.create_invite()).code;
  end loop;

  if public.my_invites_remaining() <> 0 then
    raise exception 'TEST 7 FAIL: quota not exhausted after 3 invites (got %)', public.my_invites_remaining();
  end if;

  begin
    perform public.create_invite();
    raise exception 'TEST 7 FAIL: create_invite() succeeded past the quota';
  exception when check_violation then
    null;  -- expected
  end;

  select count(*) into n from public.invites;
  if n <> 3 then raise exception 'TEST 7 FAIL: E should see their 3 invites, got %', n; end if;
end $$;
reset role;

-- 7d. F redeems one of E's codes: membership appears, the code is consumed,
--     and a second redemption of the same code fails.
--
-- F genuinely cannot SELECT E's invites (that is the point of invites_select),
-- so the code has to reach them out of band — someone texts it to them. This
-- temp table is that text message: it is stocked as postgres and readable by
-- the authenticated role, unlike public.invites.
create temp table shared_codes as
  select code, row_number() over (order by created_at) as n from public.invites;
grant select on shared_codes to authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_code text;
begin
  -- F cannot read public.invites at all — prove it, then redeem anyway.
  if (select count(*) from public.invites) <> 0 then
    raise exception 'TEST 7 FAIL: non-owner F can read invites they did not create';
  end if;

  select code into v_code from shared_codes where n = 1;

  perform public.redeem_invite(v_code);

  if not exists (select 1 from public.app_members where user_id = '00000000-0000-4000-a000-0000000000f1') then
    raise exception 'TEST 7 FAIL: redeem_invite did not grant F membership';
  end if;
end $$;
reset role;

-- The redeeming user's own row is now visible to them; the invite is consumed.
do $$
declare n int;
begin
  select count(*) into n from public.invites
   where redeemed_by = '00000000-0000-4000-a000-0000000000f1';
  if n <> 1 then raise exception 'TEST 7 FAIL: expected exactly 1 invite consumed by F, got %', n; end if;
end $$;

-- 7e. A consumed code cannot be redeemed again (uG tries F's code).
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-4000-a000-0000000000a2', 'authenticated', 'authenticated', 'rls_g@test.local', now(), now());
delete from public.app_members where user_id = '00000000-0000-4000-a000-0000000000a2';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_code text;
begin
  select code into v_code from shared_codes where n = 1;   -- the one F just used

  begin
    perform public.redeem_invite(v_code);
    raise exception 'TEST 7 FAIL: a consumed invite code was redeemed twice';
  exception when check_violation then
    null;  -- expected
  end;
end $$;
reset role;

-- 7f. The before_user_created hook: no code key allows (service-role path),
--     an unknown or empty code rejects, a live code allows.
do $$
declare
  v_code text;
  v_live jsonb;
begin
  if public.hook_require_invite('{"user":{"email":"x@test.local"}}'::jsonb) <> '{}'::jsonb then
    raise exception 'TEST 7 FAIL: hook rejected a codeless (service-role) signup';
  end if;

  if public.hook_require_invite('{"user":{"user_metadata":{"invite_code":"NOTACODE"}}}'::jsonb) -> 'error' is null then
    raise exception 'TEST 7 FAIL: hook allowed an unknown invite code';
  end if;

  if public.hook_require_invite('{"user":{"user_metadata":{"invite_code":""}}}'::jsonb) -> 'error' is null then
    raise exception 'TEST 7 FAIL: hook allowed an empty invite code';
  end if;

  select code into v_code from public.invites where redeemed_by is null limit 1;
  v_live := jsonb_build_object('user', jsonb_build_object('user_metadata',
              jsonb_build_object('invite_code', lower(v_code))));
  if public.hook_require_invite(v_live) <> '{}'::jsonb then
    raise exception 'TEST 7 FAIL: hook rejected a live invite code (case-insensitive match)';
  end if;
end $$;

-- 7g. Deleting invites: a member can only bin their OWN unclaimed codes; an
--     admin can bin anyone's, claimed included, without that removing the
--     member the claimed code let in.
--     (A is made an admin here; the row is rolled back with everything else.)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  -- F did not create any of E's codes, so this deletes nothing.
  delete from public.invites;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 7 FAIL: non-owner F deleted % invites', n; end if;
end $$;
reset role;

insert into public.admin_users (user_id) values ('00000000-0000-4000-a000-0000000000a1');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n_before int;
  n_deleted int;
begin
  select count(*) into n_before from public.invites;
  if n_before < 3 then raise exception 'TEST 7 FAIL: expected E''s 3 invites to still exist, got %', n_before; end if;

  -- Admin A created none of these, and one of them is claimed.
  delete from public.invites;
  get diagnostics n_deleted = row_count;
  if n_deleted <> n_before then
    raise exception 'TEST 7 FAIL: admin deleted % of % invites', n_deleted, n_before;
  end if;
end $$;
reset role;

-- Deleting the claimed invite must not evict the member it let in: the FK is
-- ON DELETE SET NULL, so F keeps membership and their invited_by attribution.
do $$
declare r record;
begin
  select * into r from public.app_members
   where user_id = '00000000-0000-4000-a000-0000000000f1';
  if not found then raise exception 'TEST 7 FAIL: deleting a claimed invite removed the member'; end if;
  if r.invite_id is not null then raise exception 'TEST 7 FAIL: app_members.invite_id should be null after the invite is deleted'; end if;
  if r.invited_by is null then raise exception 'TEST 7 FAIL: invited_by attribution was lost'; end if;
end $$;

-- ===========================================================================
-- TEST 8 — admin panel: vouching gate, roster visibility, audit trail
--   A is still an admin from 7g. E is an ordinary member.
-- ===========================================================================

-- 8a. A new member cannot invite anyone until an admin says so.
do $$
declare q int;
begin
  select invite_quota into q from public.app_members
   where user_id = '00000000-0000-4000-a000-0000000000f1';
  if q <> 0 then raise exception 'TEST 8 FAIL: a new member started with % invites, expected 0', q; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if public.my_invites_remaining() <> 0 then
    raise exception 'TEST 8 FAIL: an ungranted member has invites to give';
  end if;

  begin
    perform public.create_invite();
    raise exception 'TEST 8 FAIL: an ungranted member minted an invite';
  exception when check_violation then
    null;  -- expected
  end;
end $$;
reset role;

-- 8b. Only an admin may grant, read the roster, or read the overview.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  begin
    perform public.admin_set_invite_quota(
      (select id from public.profiles where user_id = '00000000-0000-4000-a000-0000000000f1'), 5);
    raise exception 'TEST 8 FAIL: a non-admin granted themselves invites';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.admin_dancer_roster();
    raise exception 'TEST 8 FAIL: a non-admin read the roster';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.admin_overview();
    raise exception 'TEST 8 FAIL: a non-admin read the overview';
  exception when insufficient_privilege then null;
  end;

  select count(*) into n from public.admin_actions;
  if n <> 0 then raise exception 'TEST 8 FAIL: a non-admin saw % audit rows', n; end if;
end $$;
reset role;

-- 8c. The grant works, is clamped, and lands in the log — and the roster
--     carries the invite trail the admin panel shows.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_target uuid := (select id from public.profiles where user_id = '00000000-0000-4000-a000-0000000000f1');
  v_quota  int;
  r        record;
  n        int;
begin
  v_quota := public.admin_set_invite_quota(v_target, 2);
  if v_quota <> 2 then raise exception 'TEST 8 FAIL: grant returned %', v_quota; end if;

  v_quota := public.admin_set_invite_quota(v_target, 999);
  if v_quota <> 20 then raise exception 'TEST 8 FAIL: quota was not clamped, got %', v_quota; end if;

  select count(*) into n from public.admin_actions where action = 'set_invite_quota';
  if n <> 2 then raise exception 'TEST 8 FAIL: audit log has % quota entries, expected 2', n; end if;

  -- F was invited by E in 7d, so the roster must say so.
  select * into r from public.admin_dancer_roster() where profile_id = v_target;
  if not found then raise exception 'TEST 8 FAIL: the roster is missing F'; end if;
  if r.invited_by_name is null then raise exception 'TEST 8 FAIL: the roster lost F''s inviter'; end if;
  if r.signed_up_at is null then raise exception 'TEST 8 FAIL: the roster lost F''s signup date'; end if;
  if r.invite_quota <> 20 then raise exception 'TEST 8 FAIL: the roster shows quota %', r.invite_quota; end if;
end $$;
reset role;

-- 8d. Suspension records a reason, and the log cannot be doctored through
--     the API — admin_actions has no insert/update/delete policy at all.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  perform public.admin_set_suspended(
    (select id from public.profiles where user_id = '00000000-0000-4000-a000-0000000000f1'),
    true,
    'testing the audit trail'
  );

  select * into r from public.admin_actions where action = 'suspend' order by created_at desc limit 1;
  if not found then raise exception 'TEST 8 FAIL: suspension was not logged'; end if;
  if r.reason <> 'testing the audit trail' then
    raise exception 'TEST 8 FAIL: the reason was not recorded (got %)', r.reason;
  end if;
  if r.actor <> '00000000-0000-4000-a000-0000000000a1' then
    raise exception 'TEST 8 FAIL: the wrong admin was recorded';
  end if;

  -- Two layers have to hold here, and they fail differently, so assert both.
  -- The GRANT is gone (20260729150000_revoke_default_grants.sql), so this
  -- raises 42501 — but even if the grant came back, admin_actions has no
  -- delete or update POLICY, so the statement would affect zero rows instead.
  -- Accept either shape; reject a row actually disappearing.
  declare
    n_deleted int := 0;
    n_left    int;
  begin
    begin
      delete from public.admin_actions;
      get diagnostics n_deleted = row_count;
    exception when insufficient_privilege then
      n_deleted := 0;
    end;
    if n_deleted <> 0 then raise exception 'TEST 8 FAIL: an admin deleted % audit rows', n_deleted; end if;

    select count(*) into n_left from public.admin_actions;
    if n_left = 0 then raise exception 'TEST 8 FAIL: the audit log was emptied'; end if;
  end;
end $$;
reset role;

-- ===========================================================================
-- TEST 9 — the signup path, end to end through the auth.users trigger
--
--   GoTrue writes signUp()'s `options.data` verbatim into raw_user_meta_data
--   and then inserts the row, so inserting into auth.users with that metadata
--   shape exercises exactly the database half of a real signup. (The half
--   this cannot reach — that GoTrue really does put options.data there, and
--   that the before_user_created hook really is wired — is what
--   scripts/verify-invites.mjs covers, over HTTP.)
-- ===========================================================================
insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('00000000-0000-4000-a000-0000000000c2','authenticated','authenticated','rls_host@test.local',now(),now());
insert into public.profiles (id, user_id, display_name)
values ('00000000-0000-4000-b000-0000000000c2','00000000-0000-4000-a000-0000000000c2','Test Host');

insert into public.invites (code, created_by) values
  ('RLSGOODAAA','00000000-0000-4000-a000-0000000000c2'),
  ('RLSMIXEDBB','00000000-0000-4000-a000-0000000000c2'),
  ('RLSLEAVERX','00000000-0000-4000-a000-0000000000c2');
insert into public.invites (code, created_by, expires_at) values
  ('RLSEXPIRED','00000000-0000-4000-a000-0000000000c2', now() - interval '1 day');

do $$
declare
  blocked boolean;
  n int;
  r record;
begin
  -- 9a. A valid code admits exactly one person, attributed to the inviter,
  --     and with NO invites of their own until an admin grants some.
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-4000-a000-0000000000c3','authenticated','authenticated','rls_guest@test.local',
          '{"invite_code":"RLSGOODAAA"}'::jsonb, now(), now());

  select * into r from public.app_members where user_id = '00000000-0000-4000-a000-0000000000c3';
  if not found then raise exception 'TEST 9 FAIL: a coded signup got no membership'; end if;
  if r.invited_by <> '00000000-0000-4000-a000-0000000000c2' then
    raise exception 'TEST 9 FAIL: the new member was not attributed to their inviter';
  end if;
  if r.invite_quota <> 0 then
    raise exception 'TEST 9 FAIL: a new member arrived able to invite (quota %)', r.invite_quota;
  end if;

  select * into r from public.invites where code = 'RLSGOODAAA';
  if r.redeemed_by <> '00000000-0000-4000-a000-0000000000c3' or r.redeemed_at is null then
    raise exception 'TEST 9 FAIL: the code was not consumed by the signup';
  end if;

  -- 9b. However the code was typed. People paste these out of messages.
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-4000-a000-0000000000c4','authenticated','authenticated','rls_mixed@test.local',
          '{"invite_code":" rls-mixed bb "}'::jsonb, now(), now());
  if not exists (select 1 from public.app_members where user_id='00000000-0000-4000-a000-0000000000c4') then
    raise exception 'TEST 9 FAIL: a normalised code was rejected';
  end if;

  -- 9c. Unknown, blank and expired codes abort the whole insert — no orphan
  --     auth user is left behind for someone to sign in with later.
  blocked := false;
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-4000-a000-0000000000c5','authenticated','authenticated','rls_bad@test.local',
            '{"invite_code":"NOSUCHCODE"}'::jsonb, now(), now());
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'TEST 9 FAIL: an unknown code created an account'; end if;
  if exists (select 1 from auth.users where id='00000000-0000-4000-a000-0000000000c5') then
    raise exception 'TEST 9 FAIL: the rejected account survived';
  end if;

  blocked := false;
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-4000-a000-0000000000c6','authenticated','authenticated','rls_blank@test.local',
            '{"invite_code":""}'::jsonb, now(), now());
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'TEST 9 FAIL: a blank code created an account'; end if;

  blocked := false;
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-4000-a000-0000000000c7','authenticated','authenticated','rls_exp@test.local',
            '{"invite_code":"RLSEXPIRED"}'::jsonb, now(), now());
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'TEST 9 FAIL: an expired code created an account'; end if;
  if (select redeemed_at from public.invites where code='RLSEXPIRED') is not null then
    raise exception 'TEST 9 FAIL: an expired code was consumed on the way to being refused';
  end if;

  -- 9d. Reuse. This is also the outcome of two signups racing one code: the
  --     consume is a conditional UPDATE, so the loser fails closed.
  blocked := false;
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-4000-a000-0000000000c8','authenticated','authenticated','rls_reuse@test.local',
            '{"invite_code":"RLSGOODAAA"}'::jsonb, now(), now());
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'TEST 9 FAIL: a spent code admitted a second person'; end if;

  -- 9e. No invite_code key at all: the service-role path (fixtures, seeds,
  --     auth.admin.createUser). Admitted, and no code is burnt for it.
  select count(*) into n from public.invites where redeemed_at is null;
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-4000-a000-0000000000c9','authenticated','authenticated','rls_svc@test.local',now(),now());
  if not exists (select 1 from public.app_members where user_id='00000000-0000-4000-a000-0000000000c9') then
    raise exception 'TEST 9 FAIL: service-role user creation got no membership';
  end if;
  if (select count(*) from public.invites where redeemed_at is null) <> n then
    raise exception 'TEST 9 FAIL: a codeless signup consumed a code';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9f. REGRESSION: a spent code must stay spent after the redeemer leaves.
--
--     invites.redeemed_by is ON DELETE SET NULL, so deleting the account that
--     used a code nulls it. Availability used to be tested on that column,
--     which meant delete_my_account() — one tap, in Settings — silently
--     reopened the code for anyone still holding it, months later, with the
--     new signup attributed to nobody. Availability is now tested on
--     redeemed_at, which nothing nulls.
--     Fixed in 20260729160000_invite_single_use_fix.sql.
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-a000-0000000000d2','authenticated','authenticated','rls_leaver@test.local',
        '{"invite_code":"RLSLEAVERX"}'::jsonb, now(), now());

delete from auth.users where id = '00000000-0000-4000-a000-0000000000d2';

do $$
declare blocked boolean := false; r record;
begin
  select * into r from public.invites where code = 'RLSLEAVERX';
  if not found then raise exception 'TEST 9 FAIL: the invite left with the departing member'; end if;
  if r.redeemed_at is null then
    raise exception 'TEST 9 FAIL: redeemed_at was cleared, so nothing records that this code was used';
  end if;

  -- The door: the hook must still refuse it.
  if public.hook_require_invite('{"user":{"user_metadata":{"invite_code":"RLSLEAVERX"}}}'::jsonb) -> 'error' is null then
    raise exception 'TEST 9 FAIL: a code spent by a departed member is live again at the hook';
  end if;

  -- And the trigger, which is the half that actually admits people.
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-4000-a000-0000000000d3','authenticated','authenticated','rls_second@test.local',
            '{"invite_code":"RLSLEAVERX"}'::jsonb, now(), now());
  exception when others then blocked := true;
  end;
  if not blocked then
    raise exception 'TEST 9 FAIL: a code spent by a departed member admitted somebody new';
  end if;
end $$;

rollback;

\echo 'ALL RLS TESTS PASSED'
