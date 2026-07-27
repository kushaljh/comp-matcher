import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { Enums } from '../../lib/database.types';

// ---------------------------------------------------------------------------
// Avatar — a brass-ringed roundel: photo if we have one, otherwise a serif
// initial on surface2. Used for the Dance Card row; the Partner Dossier's
// header photo is a bigger, non-round treatment built inline there.
// ---------------------------------------------------------------------------
type AvatarProps = {
  uri: string | null;
  name: string;
  size?: number;
};

export function Avatar({ uri, name, size = 52 }: AvatarProps) {
  const { colors, fonts, fs } = useTheme();
  const dimStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 1,
    borderColor: colors.brass,
  };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[dimStyle, { backgroundColor: colors.surface2 }]}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[dimStyle, styles.avatarFallback, { backgroundColor: colors.surface2 }]}>
      <Text style={{ fontFamily: fonts.serif, fontSize: fs(size * 0.4), color: colors.brass }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip — read-only values pill (hairline inset), used on the Partner Dossier.
// ---------------------------------------------------------------------------
export function Chip({ label }: { label: string }) {
  const { colors, fonts, fs, radii } = useTheme();
  return (
    <View
      style={[
        styles.chip,
        { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.condensedSemi,
          fontSize: fs(11.5),
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.ink,
        }}
      >
        {label}
      </Text>
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
  const { colors, fonts, fs } = useTheme();
  const isInstagram = platform === 'instagram';

  const openInstagram = () => {
    const username = handle.replace(/^@/, '').trim();
    WebBrowser.openBrowserAsync(`https://instagram.com/${username}`);
  };

  return (
    <View style={[styles.contactRow, { borderTopColor: colors.line }]}>
      <Text
        style={{
          fontFamily: fonts.condensed,
          fontSize: fs(12),
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.ink2,
        }}
      >
        {platformLabel(platform)}
      </Text>
      {isInstagram ? (
        <Pressable onPress={openInstagram}>
          <Text
            style={{ fontFamily: fonts.mono, fontSize: fs(13), color: colors.brass, textDecorationLine: 'underline' }}
            selectable
          >
            {handle}
          </Text>
        </Pressable>
      ) : (
        <Text style={{ fontFamily: fonts.mono, fontSize: fs(13), color: colors.ink }} selectable>
          {handle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
  },
});
