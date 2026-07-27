import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../theme/tokens';
import { CardContent } from './CardContent';
import type { CompetitionHistoryRow, DeckCard, SwipeDirection } from './types';

// Imperative handle so the LIKE/PASS buttons can drive the *same* fly-off
// animation + commit path as a gesture flick (single code path).
export type SwipeCardHandle = {
  swipe: (direction: SwipeDirection) => void;
};

type SwipeCardProps = {
  card: DeckCard;
  history: CompetitionHistoryRow[];
  width: number;
  height: number;
  isTop: boolean;
  // Called once, ~one fly-off duration after a swipe is committed (by gesture or
  // button), i.e. as the card leaves the screen. Both paths resolve here.
  onSwiped: (direction: SwipeDirection) => void;
};

const OFFSCREEN_MULTIPLIER = 1.6;
const FLY_DURATION_MS = 240;

export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(
  ({ card, history, width, height, isTop, onSwiped }, ref) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const threshold = width * 0.28;

    // THE single commit path. Called by the gesture (via runOnJS) and by the
    // buttons (via the imperative handle). Kicks off the visual fly-off, then
    // resolves via onSwiped.
    //
    // The commit is scheduled on a plain JS timer, NOT on reanimated's animation
    // completion callback. On web (Expo SDK 57 / reanimated 4 / worklets 0.10),
    // reanimated's shared-value animations do not run in the browser bundle, so
    // that completion callback never fired — which silently dropped the swipe and
    // left the buttons' busy-lock stuck. A timer fires on every platform, so the
    // swipe always commits; the reanimated fly-off is purely the (native) visual.
    const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const triggerSwipe = useCallback(
      (direction: SwipeDirection) => {
        const toX = (direction === 'like' ? 1 : -1) * width * OFFSCREEN_MULTIPLIER;
        translateX.value = withTiming(toX, { duration: FLY_DURATION_MS });
        if (commitTimer.current) clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => onSwiped(direction), FLY_DURATION_MS);
      },
      [width, onSwiped, translateX]
    );

    useImperativeHandle(ref, () => ({ swipe: triggerSwipe }), [triggerSwipe]);

    // Never leave a pending commit behind if the card unmounts mid-fly-off.
    useEffect(
      () => () => {
        if (commitTimer.current) clearTimeout(commitTimer.current);
      },
      []
    );

    const pan = useMemo(
      () =>
        Gesture.Pan()
          .enabled(isTop)
          .onUpdate((e) => {
            'worklet';
            translateX.value = e.translationX;
            translateY.value = e.translationY;
          })
          .onEnd((e) => {
            'worklet';
            if (Math.abs(e.translationX) > threshold) {
              runOnJS(triggerSwipe)(e.translationX > 0 ? 'like' : 'pass');
            } else {
              translateX.value = withSpring(0);
              translateY.value = withSpring(0);
            }
          }),
      [isTop, threshold, triggerSwipe, translateX, translateY]
    );

    const cardStyle = useAnimatedStyle(() => {
      const rotate = interpolate(
        translateX.value,
        [-width, 0, width],
        [-8, 0, 8],
        Extrapolation.CLAMP
      );
      return {
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          { rotate: `${rotate}deg` },
        ],
      };
    });

    const likeBadgeStyle = useAnimatedStyle(() => ({
      opacity: interpolate(translateX.value, [0, threshold], [0, 1], Extrapolation.CLAMP),
    }));
    const passBadgeStyle = useAnimatedStyle(() => ({
      opacity: interpolate(translateX.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP),
    }));

    const dims = { width, height };

    // Peek card: static, scaled-back, non-interactive, sitting behind the top.
    if (!isTop) {
      return (
        <View style={[styles.cardBase, dims, styles.peek]} pointerEvents="none">
          <CardContent card={card} history={history} />
        </View>
      );
    }

    return (
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.cardBase, dims, cardStyle]}>
          <CardContent card={card} history={history} />

          <Animated.View
            style={[styles.badge, styles.likeBadge, likeBadgeStyle]}
            pointerEvents="none"
          >
            <Text style={[styles.badgeText, styles.likeText]}>LIKE</Text>
          </Animated.View>
          <Animated.View
            style={[styles.badge, styles.passBadge, passBadgeStyle]}
            pointerEvents="none"
          >
            <Text style={[styles.badgeText, styles.passText]}>PASS</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    );
  }
);

SwipeCard.displayName = 'SwipeCard';

const styles = StyleSheet.create({
  cardBase: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  peek: {
    transform: [{ scale: 0.94 }, { translateY: 14 }],
  },
  badge: {
    position: 'absolute',
    top: spacing.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 3,
  },
  likeBadge: {
    left: spacing.md,
    borderColor: colors.brass,
    transform: [{ rotate: '-14deg' }],
  },
  passBadge: {
    right: spacing.md,
    borderColor: colors.red,
    transform: [{ rotate: '14deg' }],
  },
  badgeText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    letterSpacing: 2,
  },
  likeText: {
    color: colors.brass,
  },
  passText: {
    color: colors.red,
  },
});
