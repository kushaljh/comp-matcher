// How a contact field BEHAVES, shared by the two places one is typed into:
// onboarding (app/(auth)/onboarding) and Your Card
// (features/profile/components/ContactsSection).
//
// It lives in its own module because those two screens are the same field
// twice. When the rules only lived in contactValidation.ts the two still drifted
// — onboarding flagged errors from the first keystroke while Your Card waited
// for the button — and a dancer met different behaviour depending on which door
// they came in through.
//
// contactValidation.ts owns what a valid handle IS. This owns how the box that
// collects it acts: which keyboard, what placeholder, when to complain.

import type { TextInputProps } from 'react-native';
import { PHONE_PLATFORMS, formatPhoneInput, validateContact, type ContactPlatform } from './contactValidation';

type MaybePlatform = ContactPlatform | null | undefined;

function isPhone(platform: MaybePlatform): boolean {
  return !!platform && PHONE_PLATFORMS.has(platform);
}

// A phone number is not free text, so its field doesn't behave like one:
// numeric keypad, the OS's saved number offered by autofill, and no
// autocapitalise to fight. The placeholder carries a country code because
// validatePhone requires one and omitting it is the mistake people make.
const PHONE_FIELD_PROPS: TextInputProps = {
  keyboardType: 'phone-pad',
  autoComplete: 'tel',
  textContentType: 'telephoneNumber',
  autoCapitalize: 'none',
  autoCorrect: false,
  placeholder: '+1 415 555 1234',
};

const DEFAULT_FIELD_PROPS: TextInputProps = {
  autoCapitalize: 'none',
  autoCorrect: false,
};

/** Keyboard, autofill and placeholder for one platform's field. */
export function contactFieldProps(platform: MaybePlatform): TextInputProps {
  return isPhone(platform) ? PHONE_FIELD_PROPS : DEFAULT_FIELD_PROPS;
}

/** What belongs in the box as the user types. Phone numbers get grouped; everything else is left alone. */
export function contactDisplayValue(platform: MaybePlatform, raw: string): string {
  return isPhone(platform) ? formatPhoneInput(raw) : raw;
}

/**
 * The error to show for a field the user has already left once.
 *
 * Empty is not an error here: someone who tabs through a blank field hasn't
 * done anything wrong yet, and the submit path still tells them a handle is
 * required.
 */
export function liveContactError(platform: MaybePlatform, raw: string): string | null {
  if (!platform || !raw.trim()) return null;
  const result = validateContact(platform, raw);
  return result.ok ? null : result.error;
}
