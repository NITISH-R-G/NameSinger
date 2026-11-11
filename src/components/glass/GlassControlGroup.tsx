import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { spacing } from '../../theme/tokens';
import { GlassSurface } from './GlassSurface';

interface GlassControlGroupProps {
  children: ReactNode;
}

/**
 * The header controls (sound, orb colours, settings) in their original compact group: one pane of
 * glass hugging the three round buttons, so there is one material to render instead of three.
 */
export function GlassControlGroup({ children }: GlassControlGroupProps) {
  return (
    <GlassSurface radius={999} strong lifted contentStyle={styles.row}>
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
});
