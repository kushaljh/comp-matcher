// Shared types for the swipe feature. All derive from the generated DB types so
// they stay in lock-step with the schema.
import type { Database } from '../../lib/database.types';

export type SwipeDirection = Database['public']['Enums']['swipe_direction'];
export type Division = Database['public']['Enums']['division'];

// A single candidate as returned by the get_deck() RPC.
export type DeckCard = Database['public']['Functions']['get_deck']['Returns'][number];

export type CompetitionHistoryRow =
  Database['public']['Tables']['competition_history']['Row'];

// One of the caller's contest registrations, flattened for the picker.
export type MyEntry = {
  entryId: string;
  contestId: string;
  contestName: string;
  eventName: string;
  division: Division;
};

// Minimal shape needed to render a face in the "It's a match!" overlay.
export type MatchFace = {
  displayName: string;
  photoUrl: string | null;
};
