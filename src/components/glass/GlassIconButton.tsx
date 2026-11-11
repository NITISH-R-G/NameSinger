import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { minTouchTarget } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { buttonA11y } from '../../utils/accessibility';
import { ICON_PATHS, type IconName } from '../ActionButton';
import { GlassSurface } from './GlassSurface';

interface GlassIconButtonProps {
  /** Spoken label and the only text alternative: the icon is decoration. */
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  /** Diameter in dp (at least 48). */
  size?: number;
  /** Marks a toggle that is on, for screen readers. */
  selected?: boolean;
  /** Lets a parent group lay out the button inside its own glass. */
  flat?: boolean;
}

/**
 * A round glass control for the floating header. Same size rules and the same accessible behaviour
 * as every button: a label, disabled state, at least 48 dp.
 */
export function GlassIconButton({
  label,
  icon,
  onPress,
  disabled = false,
  accessibilityHint,
  size = 48,
  selected,
  flat = false,
}: GlassIconButtonProps) {
  const { colors } = useTheme();
  const diameter = Math.max(minTouchTarget, size);
  const iconColor = disabled ? colors.onDisabled : colors.primary;
  const press = (
    <Pressable
      {...buttonA11y({ label, disabled, hint: accessibilityHint })}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Path d={ICON_PATHS[icon]} fill={iconColor} />
      </Svg>
    </Pressable>
  );
  if (flat) return press;
  return (
    <GlassSurface radius={diameter / 2}>
      {press}
    </GlassSurface>
  );
}
