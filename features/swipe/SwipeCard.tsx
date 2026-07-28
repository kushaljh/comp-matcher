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
import { useTheme } from '../../theme/ThemeProvider';
import { CardContent } from './CardContent';
import { withAlpha } from './tint';
import type { DeckCard, SwipeDirection } from './types';

// Imperative handle so the ✕ / ✓ buttons and the keyboard shortcuts drive the
// *same* fly-off animation + commit path as a gesture flick (single code path).
export type SwipeCardHandle = {
  swipe: (direction: SwipeDirection) => void;
};

type SwipeCardProps = {
  card: DeckCard;
  roleLine: string;
  /** Signed URL for the card's photo; see CardContent. */
  photoUri: string | null;
  /** Card width — drives the fling threshold and the fly-off distance only. */
  width: number;
  // Called once, ~one fly-off duration after a swipe is committed (by gesture,
  // button or key), i.e. as the card leaves the screen. Every path resolves here.
  onSwiped: (direction: SwipeDirection) => void;
  /** A tap that landed in the middle band of the card. */
  onTapMiddle: () => void;
};

const OFFSCREEN_MULTIPLIER = 1.7;
const FLY_DURATION_MS = 240;

// The design's stamps: rotated pill outlines that fade in with the drag.
function Stamp({
  label,
  color,
  side,
  style,
}: {
  label: string;
  color: string;
  side: 'left' | 'right';
  style: object;
}) {
  const { fonts, fs, radii } = useTheme();
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.stampHalo,
        side === 'left' ? styles.stampLeft : styles.stampRight,
        {
          backgroundColor: withAlpha(color, 0.14),
          borderRadius: radii.pill,
          transform: [{ rotate: side === 'left' ? '-15deg' : '15deg' }],
        },
        style,
      ]}
    >
      <View style={[styles.stamp, { borderColor: color, borderRadius: radii.pill }]}>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: fs(19),
            lineHeight: fs(24),
            letterSpacing: 1.7,
            color,
          }}
        >
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

export const SwipeCard = forwardRef<SwipeCardHandle, SwipeCardProps>(
  ({ card, roleLine, photoUri, width, onSwiped, onTapMiddle }, ref) => {
    const { colors, radii, reduceMotion } = useTheme();
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const threshold = width * 0.26;

    // THE single commit path. Called by the gesture (via runOnJS) and by the
    // buttons / keys (via the imperative handle). Kicks off the visual fly-off,
    // then resolves via onSwiped.
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
        const duration = reduceMotion ? 0 : FLY_DURATION_MS;
        const toX = (direction === 'like' ? 1 : -1) * width * OFFSCREEN_MULTIPLIER;
        translateX.value = withTiming(toX, { duration });
        if (commitTimer.current) clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => onSwiped(direction), duration);
      },
      [width, onSwiped, translateX, reduceMotion]
    );

    useImperativeHandle(ref, () => ({ swipe: triggerSwipe }), [triggerSwipe]);

    // Never leave a pending commit behind if the card unmounts mid-fly-off.
    useEffect(
      () => () => {
        if (commitTimer.current) clearTimeout(commitTimer.current);
      },
      []
    );

    const gesture = useMemo(() => {
      const pan = Gesture.Pan()
        .onUpdate((e) => {
          'worklet';
          translateX.value = e.translationX;
          translateY.value = e.translationY * 0.5;
        })
        .onEnd((e) => {
          'worklet';
          if (Math.abs(e.translationX) > threshold) {
            runOnJS(triggerSwipe)(e.translationX > 0 ? 'like' : 'pass');
          } else {
            translateX.value = withSpring(0);
            translateY.value = withSpring(0);
          }
        });
      // Only the middle band opens the full card, per the design (the outer
      // thirds are its photo-paging zones, which we have no gallery for).
      const tap = Gesture.Tap()
        .maxDistance(8)
        .onEnd((e, success) => {
          'worklet';
          if (!success) return;
          const rel = e.x / width;
          if (rel > 0.3 && rel < 0.7) runOnJS(onTapMiddle)();
        });
      return Gesture.Exclusive(pan, tap);
    }, [threshold, triggerSwipe, translateX, translateY, onTapMiddle, width]);

    const cardStyle = useAnimatedStyle(() => {
      const rotate = interpolate(
        translateX.value,
        [-width, 0, width],
        [-11, 0, 11],
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

    const likeStampStyle = useAnimatedStyle(() => ({
      opacity: interpolate(translateX.value, [0, threshold], [0, 1], Extrapolation.CLAMP),
    }));
    const passStampStyle = useAnimatedStyle(() => ({
      opacity: interpolate(translateX.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP),
    }));

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.card,
            { backgroundColor: colors.surface, borderRadius: radii.r, borderColor: colors.cardLine },
            cardStyle,
          ]}
        >
          <CardContent card={card} roleLine={roleLine} photoUri={photoUri} />
          <Stamp label="Ask 'em" color={colors.brass} side="left" style={likeStampStyle} />
          <Stamp label="Sit out" color={colors.red} side="right" style={passStampStyle} />
        </Animated.View>
      </GestureDetector>
    );
  }
);

SwipeCard.displayName = 'SwipeCard';

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  stampHalo: {
    position: 'absolute',
    top: 48,
    padding: 4,
    zIndex: 4,
  },
  stampLeft: {
    left: 22,
  },
  stampRight: {
    right: 22,
  },
  stamp: {
    borderWidth: 2,
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(10,14,19,0.5)',
  },
});
