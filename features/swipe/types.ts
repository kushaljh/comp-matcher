// Shared types for the swipe feature. All derive from the generated DB types so
// they stay in lock-step with the schema.
import type { Database } from '../../lib/database.types';

export type SwipeDirection = Database['public']['Enums']['swipe_direction'];
export type Division = Database['public']['Enums']['division'];
export type DanceRole = Database['public']['Enums']['dance_role'];

// A single candidate as returned by the get_deck() RPC.
export type DeckCard = Database['public']['Functions']['get_deck']['Returns'][number];

export type CompetitionHistoryRow =
  Database['public']['Tables']['competition_history']['Row'];

// One of the caller's contest registrations, flattened for the picker. A dancer
// entered in one contest as both roles has TWO of these — same contest, two
// entry ids, two decks.
export type MyEntry = {
  entryId: string;
  contestId: string;
  contestName: string;
  eventName: string;
  division: Division;
  role: DanceRole;
};

// Minimal shape needed to render a face in the match celebration. isTest is
// optional because the caller's own face never carries the badge.
export type MatchFace = {
  displayName: string;
  photoUrl: string | null;
  isTest?: boolean;
};

// The caller's own profile, as the floor needs it. Role is NOT part of this any
// more — it belongs to the selected entry, not to the dancer.
export type MyProfileFace = MatchFace;

// One committed swipe, remembered locally so "take back a pass" can put the
// card back. Likes are kept too — the floor has to know the last action was a
// like in order to refuse the undo.
export type UndoEntry = {
  card: DeckCard;
  direction: SwipeDirection;
};
