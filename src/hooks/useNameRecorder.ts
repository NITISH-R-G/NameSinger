import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import type { AudioStreamFileRecordingResult } from 'expo-audio';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { MicMeter } from '../audio/levels';
import { encodeWav } from '../audio/wav';
import { synthesizeTestVoice } from '../audio/testVoice';
import type { NameRecording, RecorderPhase } from '../types';
import { MAX_RECORDING_MS } from './recorderState';
import { createRecordingController, type RecordingController } from './recordingController';
import { logCleanupCode } from './recordingCleanup';
import { deleteRecordingFile, newWorkFileUri, sweepOnce } from './recordingFiles';
import { nativeSongIO } from '../audio/nativeSongIO';
import { analyzeTake } from './analyzeTake';

/**
 * The microphone is captured natively as 16-bit mono PCM and written straight to a WAV file by
 * expo-audio's audio stream. That gives the song pipeline raw samples with no decoder, and
 * keeps the audio off the JavaScript thread (the buffer callback is not used). The requested
 * rate is a hint: the pipeline resamples whatever rate the hardware delivers.
 */
const STREAM_SAMPLE_RATE = 22_050;
const LIVE_TIMER_INTERVAL_MS = 200;

interface Session {
  uri: string | null;
  startedAt: number | null;
  result: AudioStreamFileRecordingResult | null;
}

export interface UseNameRecorderOptions {
  /** Recording is refused unless the user has accepted the consent notice. */
  consentGranted: boolean;
  /** URI currently being played by a preview. It is never deleted while this matches. */
  playingUri: string | null;
  /**
   * Optional live level meter for the voice orb. It is fed the microphone buffers the native
   * stream already delivers (the recording itself is still written natively), and only measures
   * while a take is being recorded.
   */
  meter?: MicMeter;
}

export interface UseNameRecorderResult {
  phase: RecorderPhase;
  recording: NameRecording | null;
  errorMessage: string | null;
  /** True when the recording is usable but quiet. */
  quiet: boolean;
  /** Set when a leftover recording file could not be deleted. Contains no personal data. */
  cleanupWarning: string | null;
  /** Live duration while recording, otherwise the finished recording's duration. */
  durationMs: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  /** Development only: loads a synthetic voice as if it had been recorded. */
  importTestVoice: () => Promise<void>;
  approve: () => void;
  /** Discards the current recording (and deletes its file) and returns to idle. */
  reset: () => void;
}

export function useNameRecorder({
  consentGranted,
  playingUri,
  meter,
}: UseNameRecorderOptions): UseNameRecorderResult {
  const controllerRef = useRef<RecordingController | null>(null);
  const sessionRef = useRef<Session>({ uri: null, startedAt: null, result: null });
  const [liveMs, setLiveMs] = useState(0);

  const { stream } = useAudioStream({
    sampleRate: STREAM_SAMPLE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => meter?.push(buffer),
  });

  if (controllerRef.current === null) {
    controllerRef.current = createRecordingController({
      port: {
        prepare: async () => {
          const session = sessionRef.current;
          session.result = null;
          session.startedAt = null;
          session.uri = newWorkFileUri('name');
          await stream.start();
          const started = await stream.startFileRecordingAsync({ uri: session.uri, format: 'wav' });
          session.uri = started.uri;
        },
        record: () => {
          // The stream already writes to the file; this marks when the user-visible take began.
          sessionRef.current.startedAt = Date.now();
        },
        stop: async () => {
          try {
            sessionRef.current.result = await stream.stopFileRecordingAsync();
          } finally {
            stream.stop();
          }
        },
        snapshot: () => {
          const session = sessionRef.current;
          const durationMs = session.result
            ? session.result.duration * 1000
            : session.startedAt !== null
              ? Date.now() - session.startedAt
              : 0;
          return { uri: session.uri, durationMs, fileSize: session.result?.size ?? 0 };
        },
      },
      requestPermission: async () => {
        const { granted, canAskAgain } = await requestRecordingPermissionsAsync();
        return { granted, canAskAgain };
      },
      checkPermission: async () => (await getRecordingPermissionsAsync()).granted,
      analyze: (uri) => analyzeTake(uri, nativeSongIO),
      setRecordingMode: (enabled) =>
        setAudioModeAsync({ allowsRecording: enabled, playsInSilentMode: true }),
      sweep: async () => {
        const result = await sweepOnce();
        return { failed: result.failed };
      },
      deleteFile: deleteRecordingFile,
      log: logCleanupCode,
    });
  }
  const controller = controllerRef.current;

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const state = snapshot.recorder;

  // If the OS stops the stream while a take is running (call, route change), discard the take.
  useEffect(() => {
    const subscription = stream.addListener('audioStreamStatus', (status) => {
      if (!status.isStreaming) controller.handleRecorderEvent({ hasError: false, isFinished: true });
    });
    return () => subscription.remove();
  }, [controller, stream]);

  // The meter measures only while a take is really being recorded, and is switched off on every
  // other phase and on unmount, so nothing is measured before consent, permission or after stop.
  useEffect(() => {
    meter?.setActive(state.phase === 'recording');
    return () => meter?.setActive(false);
  }, [meter, state.phase]);

  useEffect(() => {
    controller.setConsent(consentGranted);
  }, [controller, consentGranted]);

  useEffect(() => {
    controller.setPlayingUri(playingUri);
  }, [controller, playingUri]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) =>
      controller.handleAppState(next),
    );
    return () => subscription.remove();
  }, [controller]);

  // Unmount: stop an in-progress take and delete every file this session created.
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);

  // Live timer while recording, and auto-stop at the maximum length.
  useEffect(() => {
    if (state.phase !== 'recording') {
      setLiveMs(0);
      return undefined;
    }
    const timer = setInterval(() => {
      const startedAt = sessionRef.current.startedAt;
      setLiveMs(startedAt === null ? 0 : Date.now() - startedAt);
    }, LIVE_TIMER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'recording' && liveMs >= MAX_RECORDING_MS) void controller.stop();
  }, [controller, state.phase, liveMs]);

  const startRecording = useCallback(() => controller.start(), [controller]);
  const stopRecording = useCallback(() => controller.stop(), [controller]);
  const approve = useCallback(() => controller.approve(), [controller]);
  const reset = useCallback(() => controller.reset(), [controller]);

  const importTestVoice = useCallback(async () => {
    const voice = synthesizeTestVoice({ sampleRate: STREAM_SAMPLE_RATE });
    const uri = newWorkFileUri('name');
    await nativeSongIO.writeBytes(uri, encodeWav(voice));
    controller.importRecording({ uri, durationMs: (voice.samples.length / voice.sampleRate) * 1000 });
  }, [controller]);

  const showLive = state.phase === 'recording' || state.phase === 'stopping';
  const durationMs = showLive ? liveMs : (state.recording?.durationMs ?? 0);

  return {
    phase: state.phase,
    recording: state.recording,
    errorMessage: state.errorMessage,
    quiet: state.quiet === true,
    cleanupWarning: snapshot.cleanupWarning,
    durationMs,
    startRecording,
    stopRecording,
    importTestVoice,
    approve,
    reset,
  };
}
