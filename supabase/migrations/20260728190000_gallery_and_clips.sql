-- ============================================================================
-- Comp Matcher — photo gallery + spotlight clips
-- ============================================================================
-- The art-deco redesign already draws three regions the schema could not back:
-- the photo segment bar over a card, the "Photographs · N" thumbnail row, and
-- the "Floor footage" clip grid. They were built and then left empty --
-- app/(tabs)/matches/[id].tsx says so in its header comment, and
-- features/swipe/SwipeCard.tsx already reserves the left/right tap-zones for
-- photo paging. This migration is what lets those regions hold something.
--
-- ONE PHOTO STAYS MANDATORY. profiles.photo_url remains *the* primary photo:
-- it is already gated in onboarding and already flows through the deck, the
-- avatars and the matches list. Extra photos live in a side table. That keeps
-- "exactly one required" true without a CHECK constraint, and leaves every
-- existing photo read path working untouched.
--
-- Caps (4 photos total, 2 clips) are enforced client-side. A DB constraint on
-- "count of sibling rows" needs a trigger, and the cost of a stray extra row is
-- a slightly long thumbnail row -- not worth a trigger's failure modes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profile_photos — the ADDITIONAL photos only (the primary is profiles.photo_url).
-- `path` is a storage object path, same as photo_url: the bucket is private and
-- rendering goes through the signing hook.
-- ---------------------------------------------------------------------------
create table public.profile_photos (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  path       text not null,
  position   int  not null,
  created_at timestamptz not null default now(),
  unique (profile_id, position)
);

create index profile_photos_profile_idx on public.profile_photos (profile_id, position);

-- ---------------------------------------------------------------------------
-- profile_clips — links to competition footage.
--
-- A dedicated enum rather than reusing contact_platform, which carries email /
-- phone / whatsapp and would happily accept nonsense here.
--
-- `video_id` is the parsed id (a YouTube video id, an Instagram shortcode, a
-- TikTok id) kept alongside the URL so a thumbnail can be built without
-- re-parsing. Nullable because only YouTube actually yields a usable one.
-- ---------------------------------------------------------------------------
create type public.clip_platform as enum ('youtube', 'instagram', 'tiktok');

create table public.profile_clips (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform   public.clip_platform not null,
  url        text not null,
  video_id   text,
  position   int  not null,
  created_at timestamptz not null default now(),
  unique (profile_id, position)
);

create index profile_clips_profile_idx on public.profile_clips (profile_id, position);

-- ---------------------------------------------------------------------------
-- GRANTs + RLS.
--
-- Both tables copy competition_history's shape exactly: readable by any
-- authenticated user (a card has to render them), writable only by the owner.
-- The explicit GRANTs are required -- this project does not auto-expose new
-- tables to the Data API roles, so without them every call fails with
-- "permission denied for table" even though the policies are correct.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.profile_photos to authenticated;
grant select, insert, update, delete on public.profile_clips  to authenticated;
grant all on public.profile_photos, public.profile_clips to service_role;

alter table public.profile_photos enable row level security;
alter table public.profile_clips  enable row level security;

create policy profile_photos_select on public.profile_photos
  for select to authenticated
  using (true);

create policy profile_photos_insert on public.profile_photos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = profile_photos.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy profile_photos_update on public.profile_photos
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = profile_photos.profile_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = profile_photos.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy profile_photos_delete on public.profile_photos
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = profile_photos.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy profile_clips_select on public.profile_clips
  for select to authenticated
  using (true);

create policy profile_clips_insert on public.profile_clips
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = profile_clips.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy profile_clips_update on public.profile_clips
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = profile_clips.profile_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = profile_clips.profile_id
        and p.user_id = (select auth.uid())
    )
  );

create policy profile_clips_delete on public.profile_clips
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = profile_clips.profile_id
        and p.user_id = (select auth.uid())
    )
  );

-- delete_my_account() needs no change: both tables cascade from profiles, and
-- its storage cleanup already removes everything under "<uid>/", which covers
-- gallery photos since they land in the same per-user folder.
