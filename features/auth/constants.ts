// Onboarding constants: values chips + contact platform metadata.
//
// `values` is a free-text string[] column (not a DB enum), so the tag list is
// defined here as the single source of truth for the UI. Contact platforms
// ARE a DB enum (contact_platform), so those are read from database.types.ts
// via `Constants` rather than duplicated.

import { Constants } from '../../lib/database.types';

// Stored lowercase. ValuesField renders every chip uppercase, so casing here is
// invisible in the UI — and existing rows are lowercase, so matching stays
// consistent. Changing this list needs a backfill migration too: `values` is
// free text, and ValuesField renders whatever is stored, not just what's here.
export const VALUES = [
  'winning',
  'competition exposure',
  'improving',
  'making friends',
  'performing',
] as const;

export type ValueTag = (typeof VALUES)[number];

export const CONTACT_PLATFORMS = Constants.public.Enums.contact_platform;

export const PLATFORM_LABELS: Record<(typeof CONTACT_PLATFORMS)[number], string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  email: 'Email',
  other: 'Other',
};

export const DANCE_ROLES = Constants.public.Enums.dance_role;
