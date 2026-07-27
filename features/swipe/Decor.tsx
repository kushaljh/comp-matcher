// Marquee ornament: the row of pulsing bulbs, the match confetti, and the
// rise-in wrapper the expanded card uses.
//
// These use React Native's own Animated (JS driver) rather than reanimated on
// purpose: reanimated's timed animations do not tick in the web bundle on this
// stack (see the note in SwipeCard), which would leave the bulbs frozen and the
// confetti parked at the top of the screen on the platform this ships to first.
// All three collapse to a still frame when reduceMotion is on.

import { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

const NATIVE_DRIVER = Platform.OS !== 'web';

// ---------------------------------------------------------------------------
// Bulbs
// ---------------------------------------------------------------------------

export function Bulbs({ count = 7, size = 8 }: { count?: number; size?: number }) {
  const { colors, reduceMotion } = useTheme();
  const values = useRef(
    Array.from({ length: count }, () => new Animated.Value(1))
  ).current;

  useEffect(() => {
    if (reduceMotion) return;
    const runs = values.map((v, i) =>
      Animated.sequence([
        Animated.delay(i * 110),
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 0.28, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
            Animated.timing(v, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
          ])
        ),
      ])
    );
    runs.forEach((r) => r.start());
    return () => {
      runs.forEach((r) => r.stop());
      values.forEach((v) => v.setValue(1));
    };
  }, [reduceMotion, values]);

  return (
    <View style={styles.bulbRow}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: 999,
            backgroundColor: colors.brass,
            opacity: v,
          }}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Confetti — a handful of falling brass/ink slivers behind the match sheet.
// ---------------------------------------------------------------------------

const SLIVERS = 14;

export function Confetti() {
  const { colors, reduceMotion } = useTheme();
  const values = useRef(
    Array.from({ length: SLIVERS }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    if (reduceMotion) return;
    const runs = values.map((v, i) =>
      Animated.sequence([
        Animated.delay(i * 130),
        Animated.loop(
          Animated.timing(v, {
            toValue: 1,
            duration: 2600,
            easing: Easing.linear,
            useNativeDriver: NATIVE_DRIVER,
          })
        ),
      ])
    );
    runs.forEach((r) => r.start());
    return () => runs.forEach((r) => r.stop());
  }, [reduceMotion, values]);

  if (reduceMotion) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: -14,
            left: `${(i * 7.3 + 3) % 96}%`,
            width: i % 3 === 0 ? 4 : 7,
            height: i % 3 === 0 ? 10 : 3,
            backgroundColor: i % 4 === 0 ? colors.ink : colors.brass,
            opacity: v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0.5, 0] }),
            transform: [
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) },
              {
                rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '420deg'] }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// riseIn — the design's 220ms fade-up, used by the expanded card.
// ---------------------------------------------------------------------------

export function RiseIn({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { reduceMotion } = useTheme();
  const t = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      t.setValue(1);
      return;
    }
    const run = Animated.timing(t, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    });
    run.start();
    return () => run.stop();
  }, [reduceMotion, t]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bulbRow: {
    flexDirection: 'row',
    gap: 6,
  },
});
