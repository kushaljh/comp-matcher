// The design leans on `rgba(ink, .11)`-style washes. RN has no colour-mix, and
// putting `opacity` on a View would fade its text too, so translucent tints are
// built from the palette's hex here instead.
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex; // already rgba() — the palette's line/scrim roles
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
