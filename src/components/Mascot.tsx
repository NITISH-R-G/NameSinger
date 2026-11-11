import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { MascotMood } from '../constants/mascot';
import { mascotSvg } from '../utils/mascotSvg';

interface MascotProps {
  mood: MascotMood;
  size?: number;
}

/** Decorative app mascot (a headphone-wearing robot), generated locally by DiceBear. */
export function Mascot({ mood, size = 72 }: MascotProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, { width: size, height: size }]}
    >
      <SvgXml xml={mascotSvg(mood, size)} width={size} height={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
