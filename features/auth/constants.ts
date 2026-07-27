// Onboarding constants: values chips + contact platform metadata.
//
// `values` is a free-text string[] column (not a DB enum), so the tag list is
// defined here as the single source of truth for the UI. Contact platforms
// ARE a DB enum (contact_platform), so those are read from database.types.ts
// via `Constants` rather than duplicated.

import { Constants } from '../../lib/database.types';

export const VALUES = [
  'winning',
  'social fun',
  'yolo',
  'exposure',
  'improving',
  'making friends',
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
