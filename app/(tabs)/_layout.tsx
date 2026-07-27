// The app shell: marquee header on every size, a numbered left rail at
// >= 1080px, and a label-only bottom tab bar below that.
//
// The five destinations are the design's nav: The Floor, The Season, Dance
// Card, Your Card, Settings. Screens render inside <Tabs>, so a screen is free
// to lay out its own wide-layout columns (e.g. The Floor's right rail) — the
// shell only owns the header and the nav chrome.

import { Tabs, usePathname, useRouter } from 'expo-router';
import { GestureResponderEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';

const NAV = [
  { name: 'swipe', href: '/swipe', label: 'The Floor' },
  { name: 'events', href: '/events', label: 'The Season' },
  { name: 'matches', href: '/matches', label: 'Dance Card' },
  { name: 'profile', href: '/profile', label: 'Your Card' },
  { name: 'settings', href: '/settings', label: 'Settings' },
] as const;

/** The design switches to the rail layout at 1080px. */
const RAIL_BREAKPOINT = 1080;

function useActiveHref() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * Brass-ringed roundel with a radiating fan behind a DM Serif monogram — the
 * stand-in for the design's swing-out logo image, which we don't have.
 */
function LogoRoundel() {
  const { colors, fonts, fs } = useTheme();
  return (
    <View style={[styles.roundelRing, { backgroundColor: colors.likeBg }]}>
      <View style={[styles.roundel, { borderColor: colors.cardLine }]}>
        {[0, 30, 60, 90, 120, 150].map((deg) => (
          <View
            key={deg}
            style={[styles.fanBlade, { backgroundColor: colors.cardLine, transform: [{ rotate: `${deg}deg` }] }]}
          />
        ))}
        <Text style={{ fontFamily: fonts.serif, fontSize: fs(15), color: colors.brass, letterSpacing: 0.5 }}>
          CM
        </Text>
      </View>
    </View>
  );
}

function AppHeader() {
  const { colors, fonts, fs } = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <LogoRoundel />
        <View style={styles.headerText}>
          <Text style={{ fontFamily: fonts.display, fontSize: fs(19), color: colors.ink, letterSpacing: 1.4 }}>
            Comp Matcher
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.mono, fontSize: fs(9), letterSpacing: 1.6, color: colors.ink2, marginTop: 4 }}
          >
            PARTNER REGISTRY · SWING &amp; BALBOA CIRCUIT
          </Text>
        </View>
      </View>
      {/* The design draws a transparent -> brass -> transparent gradient rule.
          RN has no gradient primitive available here, so it's three flat
          segments: dim, bright, dim. */}
      <View style={styles.rule}>
        <View style={{ flex: 1, backgroundColor: colors.line }} />
        <View style={{ flex: 2, backgroundColor: colors.brass, opacity: 0.55 }} />
        <View style={{ flex: 1, backgroundColor: colors.line }} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Left rail (wide)
// ---------------------------------------------------------------------------

function LeftRail() {
  const { colors, fonts, fs } = useTheme();
  const isActive = useActiveHref();
  const router = useRouter();

  return (
    <View style={[styles.rail, { borderRightColor: colors.line }]}>
      {NAV.map((item, i) => {
        const active = isActive(item.href);
        return (
          <Pressable
            key={item.name}
            onPress={() => router.navigate(item.href)}
            style={[
              styles.railItem,
              {
                borderLeftColor: active ? colors.brass : 'transparent',
                backgroundColor: active ? colors.likeBg : 'transparent',
              },
            ]}
          >
            <Text style={{ fontFamily: fonts.mono, fontSize: fs(9), color: colors.ink2, width: 18 }}>
              {`0${i + 1}`}
            </Text>
            <Text
              style={{
                fontFamily: fonts.condensedSemi,
                fontSize: fs(15),
                letterSpacing: 2.4,
                textTransform: 'uppercase',
                color: active ? colors.ink : colors.ink2,
              }}
            >
              {item.label}
            </Text>
            <View
              style={[styles.railDot, { backgroundColor: active ? colors.brass : 'transparent' }]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bottom tab bar (narrow)
// ---------------------------------------------------------------------------

function TabBarButton({
  label,
  focused,
  onPress,
}: {
  label: string;
  focused: boolean;
  onPress?: (event: GestureResponderEvent) => void;
}) {
  const { colors, fonts, fs } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      style={styles.tabButton}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: fonts.condensedSemi,
          fontSize: fs(10),
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: focused ? colors.brass : colors.ink2,
        }}
      >
        {label}
      </Text>
      <View style={[styles.tabRule, { backgroundColor: focused ? colors.brass : 'transparent' }]} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function TabsLayout() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= RAIL_BREAKPOINT;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader />
      <View style={styles.body}>
        {wide ? <LeftRail /> : null}
        <View style={styles.main}>
          <Tabs
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: colors.bg },
              tabBarStyle: wide
                ? { display: 'none' }
                : {
                    backgroundColor: colors.bg,
                    borderTopWidth: 1,
                    borderTopColor: colors.cardLine,
                    elevation: 0,
                  },
            }}
          >
            {NAV.map((item) => (
              <Tabs.Screen
                key={item.name}
                name={item.name}
                options={{
                  title: item.label,
                  // The tab bar hands the button its focus state as
                  // `aria-selected` (not accessibilityState), so read that.
                  tabBarButton: (props) => (
                    <TabBarButton
                      label={item.label}
                      focused={props['aria-selected'] === true}
                      onPress={props.onPress}
                    />
                  ),
                }}
              />
            ))}
          </Tabs>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerText: {
    flexShrink: 1,
  },
  rule: {
    flexDirection: 'row',
    height: 1,
  },
  roundelRing: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundel: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fanBlade: {
    position: 'absolute',
    width: 1,
    height: 44,
    opacity: 0.7,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  rail: {
    width: 236,
    paddingTop: 26,
    paddingLeft: 28,
    paddingRight: 20,
    borderRightWidth: 1,
    gap: 2,
  },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderLeftWidth: 2,
  },
  railDot: {
    marginLeft: 'auto',
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 9,
    paddingBottom: 4,
  },
  tabRule: {
    width: 18,
    height: 2,
    marginTop: 6,
  },
});
