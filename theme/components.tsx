// Base components, themed. Everything here reads live from useTheme(), so a
// palette / text-size change re-renders it without a reload.
//
// Design notes:
//   Button    pill, Barlow Semi Condensed 600, uppercase, tracked. Primary is
//             solid brass with the page colour as its ink; secondary is a
//             hairline outline; destructive is a red outline.
//   TextField inset well (fieldBg + 1px line), with a tracked mono micro-label.
//   Card      raised surface with a brass hairline.
//   Screen    themed page with the 520px phone-shaped canvas kept for web.

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type ScreenProps = ViewProps & {
  children: React.ReactNode;
};

export function Screen({ children, style, ...rest }: ScreenProps) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <View style={[styles.screenContent, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'destructive';

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: ButtonProps) {
  const { colors, fonts, fs, radii } = useTheme();
  const isDisabled = disabled || loading;

  const container =
    variant === 'primary'
      ? { backgroundColor: colors.brass, borderColor: colors.brass }
      : variant === 'secondary'
        ? { backgroundColor: 'transparent', borderColor: colors.line }
        : { backgroundColor: 'transparent', borderColor: colors.red };

  const textColor =
    variant === 'primary' ? colors.bg : variant === 'secondary' ? colors.ink : colors.red;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { borderRadius: radii.pill },
        container,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            { color: textColor, fontFamily: fonts.condensedSemi, fontSize: fs(14) },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// TextField
// ---------------------------------------------------------------------------

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
};

export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  const { colors, fonts, fs } = useTheme();
  return (
    <View style={styles.fieldContainer}>
      {label ? (
        <Text style={[styles.label, { color: colors.ink2, fontFamily: fonts.mono, fontSize: fs(9.5) }]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.fieldBg,
            borderColor: error ? colors.red : colors.line,
            color: colors.ink,
            fontFamily: fonts.body,
            fontSize: fs(16),
          },
          style,
        ]}
        placeholderTextColor={colors.ink2}
        {...rest}
      />
      {error ? (
        <Text style={[styles.errorText, { color: colors.red, fontFamily: fonts.body, fontSize: fs(12) }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

type CardProps = ViewProps & {
  children: React.ReactNode;
};

export function Card({ children, style, ...rest }: CardProps) {
  const { colors, radii } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.rSm },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles (layout only — colour, radius and type come from useTheme)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
    padding: 16,
    // Phone-shaped canvas on large screens (desktop web): cap and center the
    // content column instead of smearing a mobile layout across the window.
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  fieldContainer: {
    marginBottom: 16,
  },
  label: {
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  errorText: {
    marginTop: 4,
  },
  card: {
    padding: 16,
    borderWidth: 1,
  },
});
