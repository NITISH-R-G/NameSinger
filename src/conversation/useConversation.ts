import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { createMicMeter, type LevelSource } from '../audio/levels';
import { DEFAULT_LANGUAGE_CODE } from '../constants/languages';
import { canRecord } from '../hooks/consentState';
import type { UseConsentResult } from '../hooks/useConsent';
import { useAppActive } from '../hooks/useAppActive';
import { useNameRecorder, type UseNameRecorderResult } from '../hooks/useNameRecorder';
import { useSongGenerator, type UseSongGeneratorResult } from '../hooks/useSongGenerator';
import { useSongPlayback, type UseSongPlaybackResult } from '../hooks/useSongPlayback';
import { deriveOrbState, type OrbState, type PlaybackPhase } from '../orb/orbState';
import { useAssistantSpeech } from '../speech/useAssistantSpeech';
import type { RecorderPhase } from '../types';
import * as conversation from './conversation';
import type { Chip, Command, ConversationState, Result } from './types';

const TAKE_PLAYBACK_ID = 'name-take';
const SONG_PLAYBACK_ID = 'personalized-song';

export interface UseConversationOptions {
  consent: UseConsentResult;
  /** Voice mode: the assistant speaks its messages. Text is always shown. */
  voiceMode: boolean;
}

export interface UseConversationResult {
  state: ConversationState;
  orbState: OrbState;
  /** What the orb is reacting to right now. Microphone, assistant speech and playback are independent sources. */
  orbLevel: LevelSource;
  speaking: boolean;
  /** One short line saying what is happening and what the orb will do if tapped. */
  caption: string;
  recorder: UseNameRecorderResult;
  generator: UseSongGeneratorResult;
  /** Start the conversation: asks the first question. Idempotent. */
  begin: () => void;
  /** A typed answer. The same entry point for every step. */
  submitText: (text: string) => void;
  /** A tapped reply under an assistant message. */
  pressChip: (chip: Chip) => void;
  /** A tap on the orb: the only microphone control. */
  tapOrb: () => void;
  /** Deletes the current recording (and any song made from it) on purpose. */
  deleteRecording: () => void;
  hasRecording: boolean;
  /** Development builds only: loads a synthetic voice as if it had been recorded. */
  devTestVoice: () => void;
  /** Dev diagnostics for the orb surface (never rendered in production). */
  micStats: () => { buffers: number; lastDb: number };
}

function captionFor(orb: OrbState, step: ConversationState['step'], recorderPhase: RecorderPhase, consentAllowed: boolean): string {
  switch (orb) {
    case 'listening':
      return 'Listening… tap the orb when you are done';
    case 'processing':
      return 'One moment…';
    case 'speaking':
      return 'Speaking… tap the orb to interrupt';
    case 'generating':
      return 'Making your song…';
    case 'playing':
      return 'Playing… tap the orb to pause';
    case 'paused':
      return 'Paused… tap the orb to resume';
    case 'error':
      return recorderPhase === 'permission-blocked' || recorderPhase === 'permission-denied'
        ? 'The microphone needs your attention'
        : 'Something needs your attention';
    default:
      break;
  }
  switch (step) {
    case 'ask-name':
      return consentAllowed ? 'Tap the orb and say your name' : 'Tap the orb to agree and say your name';
    case 'review-take':
      return 'Tap the orb to hear your recording';
    case 'ask-language':
      return 'Pick a language, or skip';
    case 'confirm-make':
      return 'Ready when you are';
    case 'song-ready':
      return 'Your song is ready. Tap the orb to play it';
    default:
      return '';
  }
}

/**
 * The one place that connects the conversation to everything else. Voice (the orb), typing and the
 * reply buttons all end in the same pure functions in conversation.ts; this hook only turns their
 * results into state changes and into calls on the existing engines:
 *
 *  - recorder controller (consent gate, permission, validation, retention): useNameRecorder
 *  - song pipeline: useSongGenerator (unchanged)
 *  - playback with envelope: useSongPlayback (one for the take, one for the song)
 *  - assistant speech: useAssistantSpeech
 *
 * Nothing here starts the microphone by itself: recording starts only from a tap on the orb (or the
 * "Try again" reply) and only when consent allows it. The assistant is stopped before any recording
 * or playback, and the meter measures only while a take is being recorded.
 */
export function useConversation({ consent, voiceMode }: UseConversationOptions): UseConversationResult {
  const meter = useMemo(() => createMicMeter(), []);
  const { speech, speaking } = useAssistantSpeech(voiceMode);
  const appActive = useAppActive();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const allowed = canRecord(consent.state);

  const recorder = useNameRecorder({ consentGranted: allowed, playingUri, meter });
  const generator = useSongGenerator();

  const take = recorder.phase === 'recorded' || recorder.phase === 'approved' ? recorder.recording : null;
  const songUri = generator.state.phase === 'ready' && generator.state.song !== null ? generator.state.song.uri : null;
  const takePlayback = useSongPlayback({ uri: take?.uri ?? null, id: TAKE_PLAYBACK_ID, activeId, onActivate: setActiveId });
  const songPlayback = useSongPlayback({ uri: songUri, id: SONG_PLAYBACK_ID, activeId, onActivate: setActiveId });

  // The recording being played must not be deleted underneath the player (existing protection).
  useEffect(() => {
    setPlayingUri(takePlayback.phase === 'playing' && take !== null ? take.uri : null);
  }, [takePlayback.phase, take]);

  // --- the single conversation state -------------------------------------------------------
  const [state, setState] = useState<ConversationState>(conversation.initialConversation);
  const stateRef = useRef(state);
  const latest = useRef({ recorder, generator, consent, allowed, takePlayback, songPlayback, speech, state });
  latest.current = { recorder, generator, consent, allowed, takePlayback, songPlayback, speech, state: stateRef.current };

  const apply = useCallback((result: Result) => {
    if (result.actions.length > 0) {
      stateRef.current = result.actions.reduce(conversation.conversationReducer, stateRef.current);
      setState(stateRef.current);
    }
    if (result.commands.length > 0) runCommands(result.commands);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
  }, []); // runCommands only reads refs, so it is safe to reference before its definition

  function runCommands(commands: Command[]): void {
    for (const command of commands) {
      const now = latest.current;
      switch (command) {
        case 'start-recording':
          if (!now.allowed) {
            apply(conversation.onConsentNeeded());
            break;
          }
          now.speech.stop();
          setActiveId(null);
          void now.recorder.startRecording();
          break;
        case 'stop-recording':
          void now.recorder.stopRecording();
          break;
        case 'approve-recording':
          now.recorder.approve();
          break;
        case 'discard-recording':
          setActiveId(null);
          now.generator.reset();
          now.recorder.reset();
          break;
        case 'toggle-take-playback':
          now.speech.stop();
          now.takePlayback.toggle();
          break;
        case 'toggle-song-playback':
          now.speech.stop();
          now.songPlayback.toggle();
          break;
        case 'make-song': {
          const recording = now.recorder.recording;
          if (recording === null) {
            apply(conversation.onMicrophoneProblem('error', 'I lost the recording.'));
            break;
          }
          now.speech.stop();
          setActiveId(null);
          void now.generator.generate(recording.uri, stateRef.current.language ?? DEFAULT_LANGUAGE_CODE);
          break;
        }
        case 'stop-speech':
          now.speech.stop();
          break;
        case 'repeat-question':
          speakLastQuestion();
          break;
        case 'request-consent':
          apply(conversation.onConsentNeeded());
          break;
        case 'accept-consent':
          void now.consent.accept().then((saved) => apply(conversation.onConsentAccepted(saved)));
          break;
        case 'decline-consent':
          now.consent.decline();
          break;
        case 'open-settings':
          void Linking.openSettings().catch(() => undefined);
          break;
      }
    }
  }

  function speakLastQuestion(): void {
    const messages = stateRef.current.messages;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role === 'assistant' && message.speak) {
        latest.current.speech.stop();
        latest.current.speech.setEnabled(true);
        latest.current.speech.speak(message.text);
        return;
      }
    }
  }

  // --- assistant speech: say exactly the text shown, in order, once ------------------------------
  const spokenUpTo = useRef(0);
  const recorderBusy =
    recorder.phase === 'recording' || recorder.phase === 'requesting-permission' || recorder.phase === 'stopping';
  useEffect(() => {
    const messages = state.messages;
    for (let i = spokenUpTo.current; i < messages.length; i += 1) {
      const message = messages[i];
      if (message.role === 'assistant' && message.speak && voiceMode && !recorderBusy && appActive) {
        speech.speak(message.text);
      }
    }
    spokenUpTo.current = messages.length;
  }, [state.messages, voiceMode, recorderBusy, appActive, speech]);

  // Switching voice mode on again continues from where the conversation is: the open question is said again.
  const previousVoice = useRef(voiceMode);
  useEffect(() => {
    if (voiceMode && !previousVoice.current && stateRef.current.step !== 'intro') {
      speech.setEnabled(true);
      speakLastQuestion();
    }
    previousVoice.current = voiceMode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode]);

  // The engine fell over: say so once and stay text only.
  const announcedUnavailable = useRef(false);
  useEffect(() => {
    return speech.subscribeStatus(() => {
      if (speech.unavailable() && !announcedUnavailable.current) {
        announcedUnavailable.current = true;
        apply(conversation.onSpeechUnavailable());
      }
    });
  }, [speech, apply]);

  // Never talk while the microphone is open.
  useEffect(() => {
    if (recorderBusy) speech.stop();
  }, [recorderBusy, speech]);

  // --- the recorder tells the conversation what happened --------------------------------------
  const previousPhase = useRef<RecorderPhase>(recorder.phase);
  useEffect(() => {
    const before = previousPhase.current;
    const phase = recorder.phase;
    previousPhase.current = phase;
    if (before === phase) return;
    if (phase === 'recorded' && recorder.recording !== null && stateRef.current.step === 'ask-name') {
      apply(conversation.onTakeRecorded(stateRef.current, { durationMs: recorder.recording.durationMs, quiet: recorder.quiet }));
    } else if (phase === 'unusable') {
      apply(conversation.onTakeUnusable(recorder.errorMessage ?? 'That recording did not work.'));
    } else if (phase === 'permission-denied') {
      apply(conversation.onMicrophoneProblem('denied'));
    } else if (phase === 'permission-blocked') {
      apply(conversation.onMicrophoneProblem('blocked'));
    } else if (phase === 'error') {
      apply(conversation.onMicrophoneProblem('error', recorder.errorMessage));
    } else if ((before === 'permission-blocked' || before === 'permission-denied') && phase === 'idle') {
      apply(conversation.onMicrophoneRecovered());
    }
  }, [recorder.phase, recorder.recording, recorder.quiet, recorder.errorMessage, apply]);

  // --- the song generator tells the conversation what happened --------------------------------
  const previousSong = useRef(generator.state.phase);
  useEffect(() => {
    const before = previousSong.current;
    const phase = generator.state.phase;
    previousSong.current = phase;
    if (before === phase) return;
    if (phase === 'ready') apply(conversation.onSongReady());
    else if (phase === 'error') apply(conversation.onSongFailed(generator.state.errorMessage ?? 'Something went wrong while making your song.'));
  }, [generator.state.phase, generator.state.errorMessage, apply]);

  // --- consent withdrawn: the conversation says so; nothing is deleted ------------------------
  const previousAllowed = useRef(allowed);
  useEffect(() => {
    if (previousAllowed.current && !allowed) apply(conversation.onConsentWithdrawn());
    previousAllowed.current = allowed;
  }, [allowed, apply]);

  // --- public actions --------------------------------------------------------------------------
  const begin = useCallback(() => {
    if (stateRef.current.step === 'intro') apply(conversation.begin());
  }, [apply]);

  const devTestVoice = useCallback(() => {
    if (__DEV__ && latest.current.allowed) void latest.current.recorder.importTestVoice();
  }, []);

  const submitText = useCallback(
    (text: string) => {
      if (__DEV__ && text.trim() === '/testvoice') {
        devTestVoice();
        return;
      }
      apply(conversation.onUserText(stateRef.current, text));
    },
    [apply, devTestVoice],
  );

  const pressChip = useCallback((chip: Chip) => apply(conversation.onChip(stateRef.current, chip)), [apply]);

  const orbState = deriveOrbState({
    speaking,
    recorderPhase: recorder.phase,
    songPhase: generator.state.phase,
    playback: songPlayback.phase === 'playing' || takePlayback.phase === 'playing'
      ? 'playing'
      : songPlayback.phase === 'paused' || takePlayback.phase === 'paused'
        ? 'paused'
        : ('stopped' as PlaybackPhase),
  });

  const tapOrb = useCallback(() => {
    const now = latest.current;
    const command = conversation.orbTapCommand({
      speaking: now.speech.status() === 'speaking',
      recorderPhase: now.recorder.phase,
      step: stateRef.current.step,
      consentAllowed: now.allowed,
      hasTake: now.recorder.phase === 'recorded' || now.recorder.phase === 'approved',
      songReady: now.generator.state.phase === 'ready',
      generating: now.generator.state.phase === 'generating',
    });
    if (command !== null) runCommands([command]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteRecording = useCallback(() => {
    runCommands(['discard-recording']);
    if (stateRef.current.step !== 'ask-name' && stateRef.current.step !== 'intro') {
      apply(conversation.onRecordingDeleted());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply]);

  let orbLevel: LevelSource = meter.source;
  if (orbState === 'playing') orbLevel = songPlayback.phase === 'playing' ? songPlayback.level : takePlayback.level;
  else if (orbState === 'speaking') orbLevel = speech.level;

  return {
    state,
    orbState,
    orbLevel,
    speaking,
    caption: captionFor(orbState, state.step, recorder.phase, allowed),
    recorder,
    generator,
    begin,
    submitText,
    pressChip,
    tapOrb,
    deleteRecording,
    hasRecording: recorder.recording !== null,
    devTestVoice,
    micStats: meter.stats,
  };
}

export type { UseSongPlaybackResult };
