// Data-access functions for sending feedback. Thin wrappers around the
// supabase client — no React here, so these are usable from TanStack Query
// hooks (hooks.ts) and, in principle, from scripts/tests.
//
// Only the sending half lives here. Reading feedback is an admin capability
// and lives with the other admin reads in features/admin/api.ts.
import { supabase } from '../../lib/supabase';
import type { Enums } from '../../lib/database.types';

export type NewFeedbackInput = {
  category: Enums<'feedback_category'>;
  message: string;
};

// Deliberately does NOT chain .select(): feedback has no author-side select
// policy, so a sender cannot read back even the row they just wrote, and asking
// PostgREST to return it would fail RLS. A bare insert sends
// `Prefer: return=minimal` and needs nothing but feedback_insert.
//
// Also never sends `status` — the column defaults to 'new' and the insert
// policy requires it, so a note can only ever land unresolved.
export async function submitFeedback(input: NewFeedbackInput): Promise<void> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error('Not signed in.');

  const { error } = await supabase.from('feedback').insert({
    category: input.category,
    message: input.message,
    author: user.id,
  });
  if (error) throw error;
}
