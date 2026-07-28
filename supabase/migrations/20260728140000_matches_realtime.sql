-- ============================================================================
-- Comp Matcher — realtime match notifications
-- ============================================================================
-- The dancer who liked FIRST learns about a match only when the second like
-- lands — which happens on someone else's device. Adding `matches` to the
-- realtime publication lets clients subscribe to INSERTs; Supabase Realtime
-- enforces the table's RLS for postgres_changes, so a client only ever
-- receives match rows it is a member of (matches_select policy).
-- ============================================================================

alter publication supabase_realtime add table public.matches;
