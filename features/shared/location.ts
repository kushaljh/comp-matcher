// One formatter for a dancer's local scene, so every surface renders it the
// same way and an empty profile renders nothing rather than stray commas.
//
// All three parts are independently optional: a Berlin dancer fills city and
// country and leaves state null, which is how most of the world works.

export type LocalScene = {
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

/**
 * "Austin, TX, USA" / "Berlin, Germany" / null when nothing is set.
 * Returning null (rather than an empty string) lets callers skip the whole
 * row with a plain truthiness check.
 */
export function formatLocalScene({ city, state, country }: LocalScene): string | null {
  const parts = [city, state, country]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(', ') : null;
}
