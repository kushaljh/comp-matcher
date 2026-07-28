// Parsing and validation for spotlight clip links.
//
// Mirrors contactValidation.ts's shape: return the canonical value on success,
// a message naming the expected form on failure.
//
// THUMBNAIL LIMITATION — visible to users, so worth stating here rather than
// letting it look like a bug:
// only YouTube exposes a free static thumbnail (img.youtube.com/vi/<id>/...).
// Instagram and TikTok need an authenticated oEmbed call, so their tiles render
// the design's own placeholder treatment — the diagonal hatch plus centred play
// glyph the prototype already draws — with a platform label instead of a real
// frame. YouTube tiles therefore look richer than the other two side by side.
// That is the accepted cost of supporting all three; the alternative was
// YouTube-only.

export type ClipPlatform = 'youtube' | 'instagram' | 'tiktok';

export type ParsedClip = {
  platform: ClipPlatform;
  /** Canonical, storable URL. */
  url: string;
  /** Parsed id where one exists — only YouTube's is useful for a thumbnail. */
  videoId: string | null;
};

export type ClipResult =
  | { ok: true; value: ParsedClip }
  | { ok: false; error: string };

const YOUTUBE_WATCH = /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/i;
const YOUTUBE_SHORT = /youtu\.be\/([A-Za-z0-9_-]{11})/i;
const YOUTUBE_SHORTS = /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i;
const INSTAGRAM = /instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/i;
const TIKTOK = /tiktok\.com\/@[A-Za-z0-9._]+\/video\/(\d+)/i;

/** YouTube's static thumbnail endpoint — no API key, no auth. */
export function youtubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/** The thumbnail for a clip, or null when the platform doesn't offer one. */
export function clipThumbnail(clip: { platform: ClipPlatform; video_id: string | null }): string | null {
  return clip.platform === 'youtube' && clip.video_id ? youtubeThumbnail(clip.video_id) : null;
}

export const CLIP_PLATFORM_LABELS: Record<ClipPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export function validateClipUrl(raw: string): ClipResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Paste a link to your clip.' };

  const yt =
    trimmed.match(YOUTUBE_WATCH) ?? trimmed.match(YOUTUBE_SHORT) ?? trimmed.match(YOUTUBE_SHORTS);
  if (yt) {
    return {
      ok: true,
      // Canonical watch URL regardless of which of the three forms was pasted.
      value: { platform: 'youtube', url: `https://www.youtube.com/watch?v=${yt[1]}`, videoId: yt[1] },
    };
  }

  const ig = trimmed.match(INSTAGRAM);
  if (ig) {
    return {
      ok: true,
      value: { platform: 'instagram', url: `https://www.instagram.com/p/${ig[1]}/`, videoId: ig[1] },
    };
  }

  const tt = trimmed.match(TIKTOK);
  if (tt) {
    // Strip tracking query params but keep the path, which carries the handle.
    return {
      ok: true,
      value: { platform: 'tiktok', url: trimmed.split('?')[0], videoId: tt[1] },
    };
  }

  return {
    ok: false,
    error: 'Paste a YouTube, Instagram, or TikTok video link.',
  };
}
