// Validation and canonicalisation for profile contacts.
//
// Contacts are the payoff of the whole app: a match reveals them, and that is
// the only thing a pairing actually delivers. A typo'd handle means the match
// succeeds and the two dancers still never reach each other — a failure with no
// error message anywhere. Until now the only check was "not empty".
//
// Every validator returns the CANONICAL form, and both call sites store that
// rather than the raw text, so the same handle typed three ways (with an @, as
// a pasted profile URL, with spaces in a phone number) lands identically.
//
// DELIBERATE, USER-CHOSEN RULE — do not "fix" this later as a bug:
// email rejects `+` in the local part on EVERY domain, not just Gmail. Plus
// addressing is legitimate and works at Outlook, iCloud, Fastmail and most
// self-hosted mail; this rejects those addresses too. That tradeoff was made
// knowingly. The error message says so explicitly rather than calling the
// address invalid.
//
// Validation lives here rather than in a CHECK constraint: encoding seven
// platforms' handle rules in SQL would mean a migration every time one of them
// changes its format, and the value is a good message at the point of typing.

import type { Enums } from '../../lib/database.types';

export type ContactPlatform = Enums<'contact_platform'>;

export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const ok = (value: string): ValidationResult => ({ ok: true, value });
const bad = (error: string): ValidationResult => ({ ok: false, error });

/**
 * Pull a handle out of a pasted profile URL. Returns the last non-empty path
 * segment, so "instagram.com/somedancer" and
 * "https://www.instagram.com/somedancer/?hl=en" both yield "somedancer".
 */
function handleFromUrl(raw: string, host: RegExp): string | null {
  if (!host.test(raw)) return null;
  const withoutQuery = raw.split(/[?#]/)[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  // Drop the protocol and host segments.
  const tail = segments.filter((s) => !/^https?:$/i.test(s) && !host.test(s));
  const last = tail[tail.length - 1];
  return last ? last.replace(/^@/, '') : null;
}

/** Strip a leading @, and unwrap a profile URL if one was pasted. */
function bareHandle(raw: string, host: RegExp): string {
  return (handleFromUrl(raw, host) ?? raw).trim().replace(/^@+/, '');
}

const EMAIL = /^[A-Za-z0-9._%'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function validateEmail(raw: string): ValidationResult {
  const trimmed = raw.trim();
  const [local] = trimmed.split('@');
  if (local?.includes('+')) {
    return bad("Email addresses with a “+” aren’t accepted here — use your plain address.");
  }
  if (!EMAIL.test(trimmed)) return bad('That doesn’t look like an email address.');
  return ok(trimmed.toLowerCase());
}

// E.164: a leading +, a non-zero country code, 8-15 digits total. Requiring the
// country code is the point -- competitors travel, and a bare local number is
// ambiguous or undialable for a partner arriving from another country.
function validatePhone(raw: string, label: string): ValidationResult {
  const cleaned = raw.replace(/[\s()\-.]/g, '');
  if (!cleaned.startsWith('+')) {
    return bad(`Include the country code, starting with “+” (e.g. +1 415 555 1234).`);
  }
  const digits = cleaned.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return bad(`That doesn’t look like a valid ${label} number.`);
  }
  return ok(`+${digits}`);
}

function validateInstagram(raw: string): ValidationResult {
  const handle = bareHandle(raw, /instagram\.com/i);
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    return bad('Instagram handles are up to 30 letters, numbers, dots or underscores.');
  }
  if (handle.startsWith('.') || handle.endsWith('.') || handle.includes('..')) {
    return bad('An Instagram handle can’t start or end with a dot, or contain “..”.');
  }
  return ok(handle);
}

function validateTikTok(raw: string): ValidationResult {
  const handle = bareHandle(raw, /tiktok\.com/i);
  if (!/^[A-Za-z0-9._]{2,24}$/.test(handle)) {
    return bad('TikTok handles are 2–24 letters, numbers, dots or underscores.');
  }
  return ok(handle);
}

function validateYouTube(raw: string): ValidationResult {
  const trimmed = raw.trim();
  // A /channel/UC... URL has no handle form, so it is kept whole.
  if (/youtube\.com\/channel\//i.test(trimmed)) return ok(trimmed.split(/[?#]/)[0]);
  const handle = bareHandle(trimmed, /youtube\.com/i);
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(handle)) {
    return bad('Use your YouTube @handle, or paste your channel link.');
  }
  return ok(`@${handle}`);
}

function validateFacebook(raw: string): ValidationResult {
  const trimmed = raw.trim();
  // Numeric-id profiles have no username; keep the URL as typed.
  if (/facebook\.com\/profile\.php\?id=\d+/i.test(trimmed)) return ok(trimmed);
  const handle = bareHandle(trimmed, /facebook\.com/i);
  if (!/^[A-Za-z0-9.]{5,}$/.test(handle)) {
    return bad('Facebook usernames are at least 5 letters, numbers or dots — or paste your profile link.');
  }
  return ok(handle);
}

const MAX_OTHER = 200;

/**
 * Validate one contact handle for its platform.
 * On success `value` is what should be stored.
 */
export function validateContact(platform: ContactPlatform, raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) return bad('Add a handle, number, or address.');

  switch (platform) {
    case 'email':
      return validateEmail(trimmed);
    case 'phone':
      return validatePhone(trimmed, 'phone');
    case 'whatsapp':
      return validatePhone(trimmed, 'WhatsApp');
    case 'instagram':
      return validateInstagram(trimmed);
    case 'tiktok':
      return validateTikTok(trimmed);
    case 'youtube':
      return validateYouTube(trimmed);
    case 'facebook':
      return validateFacebook(trimmed);
    case 'other':
      // Nothing meaningful to check — it's free text by definition.
      return trimmed.length > MAX_OTHER
        ? bad(`Keep this under ${MAX_OTHER} characters.`)
        : ok(trimmed);
  }
}
