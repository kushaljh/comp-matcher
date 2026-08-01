// The app shell: marquee header on every size (compact below 1080px, where
// vertical space belongs to the screen), a numbered left rail at >= 1080px,
// and a label-only, horizontally scrolling bottom tab bar below that.
//
// The destinations are the design's nav — The Floor, The Season, Dance Card,
// Your Card, Settings — plus Feedback, promoted to a tab of its own while the
// floor is mostly test users and hearing about breakage matters more than a
// tidy tab bar. Screens render inside <Tabs>, so a screen is free to lay out
// its own wide-layout columns (e.g. The Floor's right rail) — the shell only
// owns the header and the nav chrome.
//
// Admins get one more, Admin, which nobody else sees. It is REGISTERED for
// everyone and merely skipped by the tab bar rather than left out of the tree:
// a route that only conditionally exists misbehaves when someone deep-links
// to it or when useIsAdmin() resolves a beat after first render, whereas a
// registered-but-hidden one just renders its own "Not authorized".

import { Image } from 'expo-image';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsAdmin } from '../../features/admin/hooks';
import { MatchLiveBanner } from '../../features/live/matchLive';
import { useTheme } from '../../theme/ThemeProvider';

const NAV = [
  { name: 'swipe', href: '/swipe', label: 'The Floor' },
  { name: 'events', href: '/events', label: 'The Season' },
  { name: 'matches', href: '/matches', label: 'Dance Card' },
  { name: 'profile', href: '/profile', label: 'Your Card' },
  { name: 'settings', href: '/settings', label: 'Settings' },
  { name: 'feedback', href: '/feedback', label: 'Feedback' },
] as const;

/** The admin-only last destination — 07 in the rail's numbering. */
const ADMIN_NAV = { name: 'admin', href: '/admin', label: 'Admin' } as const;

type NavItem = { name: string; href: string; label: string };

/** The nav as this particular viewer sees it. */
function useNav(): NavItem[] {
  const { data: isAdmin } = useIsAdmin();
  return isAdmin ? [...NAV, ADMIN_NAV] : [...NAV];
}

/** The design switches to the rail layout at 1080px. */
const RAIL_BREAKPOINT = 1080;

/** Below this the masthead's strapline is cut off, so it runs in short form. */
const SHORT_STRAPLINE = 420;

function useActiveHref() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * Brass-ringed roundel with a radiating fan behind the swing-out mark. The
 * pixel-art pair is the same artwork as the app icon and the favicon, so the
 * tab and the in-app header finally read as one brand rather than two.
 */
function LogoRoundel({ compact }: { compact: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.roundelRing, compact && styles.roundelRingSm, { backgroundColor: colors.likeBg }]}>
      <View style={[styles.roundel, compact && styles.roundelSm, { borderColor: colors.cardLine }]}>
        {[0, 30, 60, 90, 120, 150].map((deg) => (
          <View
            key={deg}
            style={[
              styles.fanBlade,
              compact && styles.fanBladeSm,
              { backgroundColor: colors.cardLine, transform: [{ rotate: `${deg}deg` }] },
            ]}
          />
        ))}
        <Image
          source={require('../../assets/logo-swingout.png')}
          style={[styles.logoMark, compact && styles.logoMarkSm]}
          contentFit="contain"
          // The art is already brass on transparent — no tint needed.
          accessibilityLabel="Comp Matcher"
        />
      </View>
    </View>
  );
}

/**
 * The masthead. Below the rail breakpoint it runs compact: vertical space on a
 * phone belongs to the screen's own content (the swipe deck most of all), not
 * to a 52px roundel.
 */
function AppHeader({ compact }: { compact: boolean }) {
  const { colors, fonts, fs } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: colors.bg }}>
      <View style={[styles.header, compact && styles.headerSm]}>
        <LogoRoundel compact={compact} />
        <View style={styles.headerText}>
          <Text
            style={{ fontFamily: fonts.display, fontSize: fs(compact ? 17 : 19), color: colors.ink, letterSpacing: 1.4 }}
          >
            Comp Matcher
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.mono, fontSize: fs(9), letterSpacing: 1.6, color: colors.ink2, marginTop: 4 }}
          >
            {/* The full strapline ellipsises on a phone, which reads as a bug
                rather than as a strapline. Narrow screens get the short form. */}
            {width < SHORT_STRAPLINE ? 'PARTNER REGISTRY' : 'PARTNER REGISTRY · SWING & BALBOA CIRCUIT'}
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
  const nav = useNav();

  return (
    <View style={[styles.rail, { borderRightColor: colors.line }]}>
      {nav.map((item, i) => {
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

/**
 * The shape of what a bottom-tab navigator hands its `tabBar`. Declared
 * structurally rather than imported as BottomTabBarProps: @react-navigation/
 * bottom-tabs is only a transitive dependency of expo-router, and importing
 * types out of a package this app does not itself depend on is how a working
 * build breaks on someone else's hoisting.
 */
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

/**
 * A horizontally scrolling bottom bar, replacing the stock one.
 *
 * The stock BottomTabBar splits the width evenly and cannot scroll, so six
 * destinations (seven for admins) on a phone left every label ellipsised —
 * "THE FLO…", "DANCE C…". Here each tab is sized to its own text and the row
 * scrolls, so a label is either fully readable or off-screen, never half of
 * one. Short rows stay centred; only an overflowing row actually scrolls.
 *
 * Hiding Admin here also genuinely removes it: the old tabBarButton -> null
 * still left the stock bar holding a flex slot open for it.
 */
function ScrollingTabBar({ state, descriptors, navigation, isAdmin }: TabBarProps & { isAdmin: boolean }) {
  const { colors, fonts, fs } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // route key -> x within the scroll content, filled in as the tabs lay out.
  const offsets = useRef<Record<string, number>>({});
  const activeKey = state.routes[state.index]?.key;

  // Keep the active tab on screen — otherwise the last destinations look
  // unreachable, and deep-linking to one leaves the bar pointing elsewhere.
  // The 24 leaves the previous tab peeking, so it reads as a scrollable row.
  const reveal = (key: string | undefined, animated: boolean) => {
    const x = key === undefined ? undefined : offsets.current[key];
    if (x === undefined) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, x - 24), animated });
  };

  // Fires on navigation. On first mount it is a no-op — onLayout has not run
  // yet, so nothing is measured — which is why the tabs also reveal
  // themselves from onLayout below.
  useEffect(() => {
    reveal(activeKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderTopWidth: 1,
        borderTopColor: colors.cardLine,
        // The stock bar applied this itself, and AppHeader's SafeAreaView
        // deliberately excludes the bottom edge — so it lands here.
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {state.routes.map((route, i) => {
          if (route.name === ADMIN_NAV.name && !isAdmin) return null;
          const focused = state.index === i;
          const label = descriptors[route.key]?.options.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              onLayout={(e) => {
                offsets.current[route.key] = e.nativeEvent.layout.x;
                // The measurement that lands last on first paint is the one
                // that finally lets the active tab be revealed.
                if (route.key === activeKey) reveal(route.key, false);
              }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
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
        })}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function TabsLayout() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= RAIL_BREAKPOINT;
  const { data: isAdmin } = useIsAdmin();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader compact={!wide} />
      <View style={styles.body}>
        {wide ? <LeftRail /> : null}
        <View style={styles.main}>
          <Tabs
            // The wide layout navigates from the rail, so there is no bar at
            // all rather than a hidden one.
            tabBar={(props) =>
              wide ? null : <ScrollingTabBar {...(props as unknown as TabBarProps)} isAdmin={isAdmin === true} />
            }
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: colors.bg },
            }}
          >
            {[...NAV, ADMIN_NAV].map((item) => (
              // Admin is registered for everyone so the route always exists;
              // a non-admin simply gets no tab for it (ScrollingTabBar skips
              // it), and /admin itself renders AdminGate's "Not authorized".
              // Not `href: null` — that unregisters the route, which breaks
              // deep links and misbehaves while useIsAdmin() is still resolving.
              <Tabs.Screen key={item.name} name={item.name} options={{ title: item.label }} />
            ))}
          </Tabs>
        </View>
      </View>
      <MatchLiveBanner />
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
  headerSm: {
    gap: 11,
    paddingTop: 10,
    paddingBottom: 8,
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
  roundelRingSm: {
    width: 42,
    height: 42,
  },
  logoMark: {
    width: 30,
    height: 30,
  },
  logoMarkSm: {
    width: 24,
    height: 24,
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
  roundelSm: {
    width: 36,
    height: 36,
  },
  fanBlade: {
    position: 'absolute',
    width: 1,
    height: 44,
    opacity: 0.7,
  },
  fanBladeSm: {
    height: 36,
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
  // flexGrow + centre keeps a short row centred; an overflowing one ignores
  // justifyContent and simply scrolls.
  tabRow: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 20,
  },
  tabButton: {
    // Deliberately no flex: intrinsic width is what stops the ellipsis.
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
