import { useCallback, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useConsent } from '../hooks/useConsent';
import { useReducedMotion } from '../hooks/useAppActive';
import { useTheme } from '../theme/useTheme';
import { ConversationScreen } from './ConversationScreen';
import { OpeningScreen } from './OpeningScreen';

type Stage = 'opening' | 'entering' | 'conversation';

export const TRANSITION_MS = 1900;
export const REDUCED_TRANSITION_MS = 260;

/**
 * Owns the one animated value (`progress`, 0 to 1) that carries the opening into the conversation.
 *
 *  opening       the glass dome and the swipe-up invitation; no recorder, no microphone, nothing asked.
 *  entering      the conversation is mounted (hidden) and measured, then `progress` runs: the glass
 *                orb rises onto the spot where the violet orb will be, dissolves into it, and the
 *                header, transcript and composer rise in.
 *  conversation  the opening is gone; the first assistant question is asked now.
 *
 * Consent state is read here so it is shared by the conversation and the settings sheet.
 */
export function AppShell() {
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { colors } = useTheme();
  const consent = useConsent();
  const [stage, setStage] = useState<Stage>('opening');
  const [targetOffsetY, setTargetOffsetY] = useState(-height * 0.12);
  const [started, setStarted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const measured = useRef(false);
  const requested = useRef(false);
  const running = useRef(false);

  const run = useCallback(() => {
    if (running.current) return;
    running.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? REDUCED_TRANSITION_MS : TRANSITION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setStage('conversation');
        setStarted(true);
      }
    });
  }, [progress, reduced]);

  const enter = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setStage('entering'); // mounts the conversation; it reports where its orb is, then the animation runs
    setTimeout(() => {
      // If the measurement never arrives (it always should), do not leave the user on the opening.
      if (!measured.current) run();
    }, 600);
  }, [run]);

  const onOrbCenter = useCallback(
    (centerY: number) => {
      if (measured.current && stage !== 'entering') return;
      setTargetOffsetY(centerY - height / 2);
      if (!measured.current && requested.current) {
        measured.current = true;
        run();
      } else {
        measured.current = true;
      }
    },
    [height, run, stage],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {stage !== 'opening' ? (
        <ConversationScreen consent={consent} enter={progress} started={started} onOrbCenter={onOrbCenter} />
      ) : null}
      {stage !== 'conversation' ? (
        <OpeningScreen
          progress={progress}
          targetOffsetY={targetOffsetY}
          onEnter={enter}
          reducedMotion={reduced}
          interactive={stage === 'opening'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
