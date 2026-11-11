import { Pressable } from 'react-native';

import type { LevelSource } from '../audio/levels';
import { orbDescription, type OrbState } from '../orb/orbState';
import { VoiceOrb } from './VoiceOrb';

interface OrbSurfaceProps {
  state: OrbState;
  level: LevelSource;
  size: number;
  /** One line saying what the orb is doing and what a tap does. Spoken by screen readers. */
  caption: string;
  onPress: () => void;
}

/**
 * The orb as the interaction surface: the only microphone control in the app. What a tap means is
 * decided in one place (`orbTapCommand` in conversation.ts) and described by `caption`, so the
 * spoken label always matches the behaviour. The orb's own accessible label is the description of
 * its state; levels are never announced.
 */
export function OrbSurface({ state, level, size, caption, onPress }: OrbSurfaceProps) {
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${orbDescription(state)} ${caption}`}
      accessibilityState={{ busy: state === 'processing' || state === 'generating' }}
      onPress={onPress}
      style={{ width: size, height: size }}
    >
      <VoiceOrb state={state} level={level} size={size} />
    </Pressable>
  );
}
