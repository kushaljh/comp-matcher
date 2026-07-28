// Full-screen photo viewer: tap a cropped card/dossier photo to see the whole
// image. Modal-based so it overlays everything on iOS/Android/web alike;
// backdrop tap or ✕ closes.

import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

type PhotoLightboxProps = {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
};

export function PhotoLightbox({ uri, visible, onClose }: PhotoLightboxProps) {
  const { colors, fonts, fs, radii } = useTheme();
  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close photo">
        <Image
          source={{ uri }}
          contentFit="contain"
          style={styles.image}
          accessibilityLabel="Full-size photo"
        />
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          style={[
            styles.close,
            { borderColor: colors.ink, backgroundColor: colors.scrim, borderRadius: radii.pill },
          ]}
        >
          <Text style={{ fontFamily: fonts.body, fontSize: fs(16), color: colors.ink }}>✕</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,5,6,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '86%',
  },
  close: {
    position: 'absolute',
    top: 46,
    right: 18,
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
