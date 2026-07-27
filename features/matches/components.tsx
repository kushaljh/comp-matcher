import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';
import type { Enums } from '../../lib/database.types';

// ---------------------------------------------------------------------------
// Avatar — photo if we have one, otherwise a circle with the first initial.
// ---------------------------------------------------------------------------
type AvatarProps = {
  uri: string | null;
  name: string;
  size?: number;
};

export function Avatar({ uri, name, size = 56 }: AvatarProps) {
  const dimStyle = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[styles.avatarImage, dimStyle]} contentFit="cover" />;
  }
  return (
    <View style={[styles.avatarFallback, dimStyle]}>
      <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip — read-only pill, used for values.
// ---------------------------------------------------------------------------
export function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contact rendering — instagram opens the browser; everything else renders as
// copy-friendly selectable text (no clipboard dependency available).
// ---------------------------------------------------------------------------
const PLATFORM_LABELS: Record<Enums<'contact_platform'>, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  email: 'Email',
  other: 'Other',
};

export function platformLabel(platform: Enums<'contact_platform'>): string {
  return PLATFORM_LABELS[platform];
}

export function ContactLine({
  platform,
  handle,
}: {
  platform: Enums<'contact_platform'>;
  handle: string;
}) {
  const isInstagram = platform === 'instagram';

  const openInstagram = () => {
    const username = handle.replace(/^@/, '').trim();
    WebBrowser.openBrowserAsync(`https://instagram.com/${username}`);
  };

  return (
    <View style={styles.contactRow}>
      <Text style={styles.contactPlatform}>{platformLabel(platform)}</Text>
      {isInstagram ? (
        <Pressable onPress={openInstagram}>
          <Text style={[styles.contactHandle, styles.contactLink]} selectable>
            {handle}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.contactHandle} selectable>
          {handle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarImage: {
    backgroundColor: colors.creamDark,
  },
  avatarFallback: {
    backgroundColor: colors.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.navy,
    fontWeight: fontWeights.bold,
  },
  chip: {
    backgroundColor: colors.creamDark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 4,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contactPlatform: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  contactHandle: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  contactLink: {
    color: colors.brassDark,
    textDecorationLine: 'underline',
  },
});
