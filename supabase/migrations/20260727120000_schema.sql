-- ============================================================================
-- Comp Matcher — Schema (enums, tables, constraints, indexes, entry trigger)
-- ============================================================================
-- Domain: swing-dance competition partner matching.
-- Events -> contests -> (per contest) a subset of divisions. Users have ONE
-- profile (one role). Users create an entry per contest (their division). They
-- swipe on opposite-role entries in the same contest+division; a mutual like
-- creates a match that reveals contact info.
--
-- Privacy is enforced by RLS in a later migration; this file only defines the
-- shape of the data plus integrity constraints that do not depend on the caller.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.dance_role       as enum ('leader', 'follower');
create type public.event_status     as enum ('pending', 'approved');
create type public.swipe_direction  as enum ('like', 'pass');
create type public.contact_platform as enum ('instagram', 'facebook', 'tiktok', 'youtube', 'whatsapp', 'phone', 'email', 'other');
create type public.division         as enum ('novice', 'amateur', 'advanced', 'open');

-- ---------------------------------------------------------------------------
-- profiles
--   One profile per auth user (v2 will relax to one-per-role; keep it a
--   separate table keyed by user_id so that migration is trivial).
--   NOTE: `values` is a reserved SQL keyword, so the column is quoted in DDL;
--   the actual column name is still `values` (PostgREST/JS see `values`).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null,
  role         public.dance_role not null,
  photo_url    text,
  bio          text,
  "values"     text[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profile_contacts
--   Contact handles. Visibility is gated by RLS (owner or a mutual match).
-- ---------------------------------------------------------------------------
create table public.profile_contacts (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform   public.contact_platform not null,
  handle     text not null,
  unique (profile_id, platform)
);

-- ---------------------------------------------------------------------------
-- competition_history
--   Prior results shown on a profile. `placement` is optional (a competitor
--   may have competed without placing); the descriptive fields are required
--   because a history row is meaningless without them (minor tightening vs
--   spec — documented in the log).
-- ---------------------------------------------------------------------------
create table public.competition_history (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  event_name   text not null,
  year         int  not null,
  contest_name text not null,
  placement    text
);

-- ---------------------------------------------------------------------------
-- events
--   User-suggested events start `pending`; a human approves them (via the
--   dashboard / service role) to `approved`. `suggested_by` is SET NULL on
--   user deletion so the event survives.
-- ---------------------------------------------------------------------------
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  location     text not null,
  start_date   date not null,
  end_date     date not null,
  website_url  text,
  facebook_url text,
  status       public.event_status not null default 'pending',
  suggested_by uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- contests
--   Each contest offers a non-empty subset of divisions.
--   cardinality() (not array_length) is used so an empty array fails the CHECK
--   — array_length('{}',1) returns NULL, which would silently pass.
-- ---------------------------------------------------------------------------
create table public.contests (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references public.events (id) on delete cascade,
  name      text not null,
  divisions public.division[] not null,
  check (cardinality(divisions) > 0)
);

-- ---------------------------------------------------------------------------
-- entries
--   A user's registration in a contest at a chosen division. One per
--   (profile, contest). The chosen division must be offered by the contest —
--   enforced by a trigger below.
-- ---------------------------------------------------------------------------
create table public.entries (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  contest_id uuid not null references public.contests (id) on delete cascade,
  division   public.division not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (profile_id, contest_id)
);

-- ---------------------------------------------------------------------------
-- swipes
--   A directed judgement by one profile on another within a contest.
--   PRIVACY-CRITICAL: RLS makes these readable ONLY by the swiper.
-- ---------------------------------------------------------------------------
create table public.swipes (
  id                uuid primary key default gen_random_uuid(),
  contest_id        uuid not null references public.contests (id) on delete cascade,
  swiper_profile_id uuid not null references public.profiles (id) on delete cascade,
  target_profile_id uuid not null references public.profiles (id) on delete cascade,
  direction         public.swipe_direction not null,
  created_at        timestamptz not null default now(),
  unique (contest_id, swiper_profile_id, target_profile_id),
  check (swiper_profile_id <> target_profile_id)
);

-- ---------------------------------------------------------------------------
-- matches
--   Created only by the match trigger (SECURITY DEFINER). The pair is stored
--   ordered (profile_a < profile_b) so a mutual like maps to exactly one row.
-- ---------------------------------------------------------------------------
create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  profile_a  uuid not null references public.profiles (id) on delete cascade,
  profile_b  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (profile_a < profile_b),
  unique (contest_id, profile_a, profile_b)
);

-- ---------------------------------------------------------------------------
-- Indexes
--   The deck query filters entries by (contest_id, division), excludes rows
--   the caller already swiped (swiper_profile_id, contest_id), and excludes
--   existing matches (by either member). Lookups also join contacts/history
--   by profile_id and contests by event_id.
-- ---------------------------------------------------------------------------
create index entries_contest_division_idx on public.entries (contest_id, division);
create index swipes_swiper_contest_idx    on public.swipes (swiper_profile_id, contest_id);
create index matches_profile_a_idx        on public.matches (profile_a);
create index matches_profile_b_idx        on public.matches (profile_b);
create index contests_event_id_idx        on public.contests (event_id);
create index competition_history_profile_idx on public.competition_history (profile_id);
-- (profile_contacts and entries lookups by profile_id are already covered by
--  their UNIQUE(profile_id, ...) indexes.)

-- ---------------------------------------------------------------------------
-- Entry division validation
--   The chosen division must be one the contest offers. Implemented as a
--   BEFORE INSERT/UPDATE trigger.
--
--   SECURITY DEFINER + pinned empty search_path: the check reads public.contests
--   as the function owner so it is correct regardless of the caller's RLS
--   visibility of the contest row (e.g. the service_role during seeding, or an
--   authenticated user). It never returns contest data to the caller — it only
--   validates — so this does not widen any read surface.
-- ---------------------------------------------------------------------------
create or replace function public.validate_entry_division()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.contests c
    where c.id = new.contest_id
      and new.division = any (c.divisions)
  ) then
    raise exception 'division % is not offered by contest %', new.division, new.contest_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger entries_validate_division
  before insert or update on public.entries
  for each row execute function public.validate_entry_division();
