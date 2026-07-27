import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';
import type { MatchFace } from './types';

type MatchOverlayProps = {
  me: MatchFace;
  them: MatchFace;
  onKeepSwiping: () => void;
  onSeeMatches: () => void;
};

function Face({ face }: { face: MatchFace }) {
  const initial = face.displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={styles.face}>
      {face.photoUrl ? (
        <Image source={{ uri: face.photoUrl }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      )}
      <Text style={styles.faceName} numberOfLines={1}>
        {face.displayName}
      </Text>
    </View>
  );
}

// "It's a match!" celebration. Presented as a modal so it sits above the deck
// and the tab bar. Dismiss keeps the user swiping; the CTA jumps to Matches.
export function MatchOverlay({ me, them, onKeepSwiping, onSeeMatches }: MatchOverlayProps) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onKeepSwiping}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>It&apos;s a match!</Text>
          <View style={styles.faces}>
            <Face face={me} />
            <Text style={styles.heart}>💃🕺</Text>
            <Face face={them} />
          </View>
          <Text style={styles.subtitle}>
            You and {them.displayName} liked each other. Your contact info is now visible
            to each other in the Matches tab.
          </Text>
          <View style={styles.actions}>
            <Button title="See matches" onPress={onSeeMatches} />
            <Pressable onPress={onKeepSwiping} style={styles.keepSwiping}>
              <Text style={styles.keepSwipingText}>Keep swiping</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(27, 36, 48, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.brass,
    textAlign: 'center',
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  face: {
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 120,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.brass,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  avatarInitial: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.brass,
  },
  faceName: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  heart: {
    fontSize: fontSizes.lg,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fontSizes.sm * 1.4,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  keepSwiping: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  keepSwipingText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
});
