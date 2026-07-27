// Alert.alert is a no-op on web (react-native-web ships an empty stub), and
// this app targets iOS/Android/web, so destructive confirmations branch on
// platform: a native Alert sheet off-web, window.confirm on web.
import { Alert, Platform } from 'react-native';

export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Confirm'
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
