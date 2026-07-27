-- ============================================================================
-- Comp Matcher — Seed data (3 approved events + their contests)
-- ============================================================================
-- Fixed UUIDs so fixtures (scripts/create-fixtures.mjs) and tests can reference
-- rows deterministically. Idempotent via ON CONFLICT DO NOTHING.
--
-- NOTE FOR KUSHAL: dates and URLs below are plausible placeholders — please
-- curate the real event dates and official links before launch.
--
-- Contest UUIDs the fixtures rely on:
--   California Balboa Classic / "Strictly Balboa" = b2222222-0000-4000-8000-000000000001
--     offers {novice, amateur, advanced, open}  (leader1/follower1 novice match here; leader2 advanced here)
--   California Balboa Classic / "Strictly Lindy"  = b2222222-0000-4000-8000-000000000002
--     offers {novice, advanced, open}            (follower2 novice entry here — different contest)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
insert into public.events (id, name, location, start_date, end_date, website_url, facebook_url, status)
values
  ('a1111111-1111-4111-8111-111111111111', 'Camp Hollywood',            'Los Angeles, CA', '2026-08-28', '2026-09-01', 'https://camphollywood.net',   'https://www.facebook.com/CampHollywood',  'approved'),
  ('a2222222-2222-4222-8222-222222222222', 'California Balboa Classic', 'Pasadena, CA',    '2027-01-15', '2027-01-18', 'https://calbalclassic.com',   'https://www.facebook.com/CalBalClassic',  'approved'),
  ('a3333333-3333-4333-8333-333333333333', 'Stardust Slow Balboa Weekend', 'Glen Echo Park, Washington DC', '2026-11-20', '2026-11-22', 'https://stardustweekend.com', null,                            'approved')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Contests (divisions vary per event)
-- ---------------------------------------------------------------------------
insert into public.contests (id, event_id, name, divisions)
values
  -- Camp Hollywood
  ('b1111111-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 'Strictly Lindy',  array['novice','amateur','advanced','open']::public.division[]),
  ('b1111111-0000-4000-8000-000000000002', 'a1111111-1111-4111-8111-111111111111', 'Strictly Balboa', array['novice','advanced','open']::public.division[]),
  ('b1111111-0000-4000-8000-000000000003', 'a1111111-1111-4111-8111-111111111111', 'Amateur Strictly',array['novice','amateur']::public.division[]),

  -- California Balboa Classic
  ('b2222222-0000-4000-8000-000000000001', 'a2222222-2222-4222-8222-222222222222', 'Strictly Balboa', array['novice','amateur','advanced','open']::public.division[]),
  ('b2222222-0000-4000-8000-000000000002', 'a2222222-2222-4222-8222-222222222222', 'Strictly Lindy',  array['novice','advanced','open']::public.division[]),
  ('b2222222-0000-4000-8000-000000000003', 'a2222222-2222-4222-8222-222222222222', 'Amateur Strictly',array['amateur']::public.division[]),

  -- Stardust Slow Balboa Weekend (real event: amateur + advanced strictly)
  ('b3333333-0000-4000-8000-000000000001', 'a3333333-3333-4333-8333-333333333333', 'Strictly Slow Balboa', array['amateur','advanced']::public.division[])
on conflict (id) do nothing;
