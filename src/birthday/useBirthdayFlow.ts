import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { createMicMeter } from '../audio/levels';

import { nativeSongIO } from '../audio/nativeSongIO';
import { synthesizeTestVoice } from '../audio/testVoice';
import { decodeWav, encodeWav } from '../audio/wav';
import { useConsent } from '../hooks/useConsent';
import { useNameRecorder } from '../hooks/useNameRecorder';
import { useSongPlayback } from '../hooks/useSongPlayback';
import { deleteRecordingFile, newWorkFileUri } from '../hooks/recordingFiles';
import { buildCue, type Cue } from './cue';
import { birthdayFlowReducer, initialBirthdayFlow, canContinueFromSetup } from './birthdayFlow';
import { NoSingingFoundError, renderBirthdaySong, type RenderReport } from './renderBirthday';
import type { KeyName } from './score';
import { loadBirthdaySong, type LoadedSong } from './songAssets';

const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const quietly = (uri: string | null): void => {
  if (uri === null) return;
  try {
    deleteRecordingFile(uri);
  } catch {
    // A leftover cache file is removed by the app's own sweep at the next start.
  }
};

export const NO_SINGING_MESSAGE =
  "We couldn't hear you singing the name. Try again with headphones on, a little closer to the microphone, and start singing when the guide notes begin.";
export const MAKE_FAILED_MESSAGE = 'Something went wrong while making your song. Please record the name again.';

interface LoadedSongForKey extends LoadedSong {
  key: KeyName;
}
interface BuiltCue {
  uri: string;
  cue: Cue;
  key: KeyName;
  syllables: number;
}
export interface MadeSong {
  uri: string;
  report: RenderReport;
  renderMs: number;
}

/**
 * Everything the birthday screen needs: the form, the song and guide for the chosen key, the guided
 * recording (the app's own consent-gated recorder), the render, and playback of each. All audio is
 * handled on the phone; nothing is uploaded.
 */
export function useBirthdayFlow() {
  const consent = useConsent();
  const [flow, dispatch] = useReducer(birthdayFlowReducer, initialBirthdayFlow);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [song, setSong] = useState<LoadedSongForKey | null>(null);
  const [songError, setSongError] = useState(false);
  const [cue, setCue] = useState<BuiltCue | null>(null);
  const [devTakeUri, setDevTakeUri] = useState<string | null>(null);
  const [result, setResult] = useState<MadeSong | null>(null);
  const [makeError, setMakeError] = useState<string | null>(null);

  const takeUriRef = useRef<string | null>(null);
  // Measures the microphone only while a take is really being recorded (same meter the main orb uses).
  const meter = useMemo(() => createMicMeter(), []);
  const recorder = useNameRecorder({
    meter,
    consentGranted: consent.state.status === 'accepted',
    playingUri: activeId === 'take' ? takeUriRef.current : null,
  });
  const recordedUri = recorder.phase === 'recorded' ? (recorder.recording?.uri ?? null) : null;
  const takeUri = devTakeUri ?? recordedUri;
  takeUriRef.current = takeUri;

  const songPlay = useSongPlayback({ uri: song?.uri ?? null, id: 'song', activeId, onActivate: setActiveId });
  const cuePlay = useSongPlayback({ uri: cue?.uri ?? null, id: 'cue', activeId, onActivate: setActiveId });
  const takePlay = useSongPlayback({ uri: takeUri, id: 'take', activeId, onActivate: setActiveId });
  const resultPlay = useSongPlayback({ uri: result?.uri ?? null, id: 'result', activeId, onActivate: setActiveId });
  const cuePlayRef = useRef(cuePlay);
  cuePlayRef.current = cuePlay;

  // ---- the song for the chosen key ---------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    setSongError(false);
    loadBirthdaySong(flow.key).then(
      (loaded) => alive && setSong({ ...loaded, key: flow.key }),
      () => alive && setSongError(true),
    );
    return () => {
      alive = false;
    };
  }, [flow.key]);

  // ---- the guide cue for this key and syllable count -----------------------------------------------
  const cueUriRef = useRef<string | null>(null);
  useEffect(() => {
    if (song === null || song.key !== flow.key) return undefined;
    let alive = true;
    void (async () => {
      try {
        const built = buildCue(song.pcm, flow.key, flow.syllables);
        const uri = newWorkFileUri('song');
        await nativeSongIO.writeBytes(uri, encodeWav(built.audio));
        if (!alive) {
          quietly(uri);
          return;
        }
        quietly(cueUriRef.current);
        cueUriRef.current = uri;
        setCue({ uri, cue: built, key: flow.key, syllables: flow.syllables });
      } catch {
        if (alive) setSongError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [song, flow.key, flow.syllables]);
  const cueReady = cue !== null && cue.key === flow.key && cue.syllables === flow.syllables;

  // ---- recording: the guide plays while the take runs, and the take stops when the guide ends ------
  const cueStarted = useRef(false);
  useEffect(() => {
    if (recorder.phase === 'recording') {
      if (!cueStarted.current && cue !== null) {
        cueStarted.current = true;
        cuePlayRef.current.toggle();
      }
      const ms = ((cue?.cue.durationSec ?? 9) + 0.3) * 1000;
      const timer = setTimeout(() => void recorder.stopRecording(), ms);
      return () => clearTimeout(timer);
    }
    if (cueStarted.current) {
      cueStarted.current = false;
      cuePlayRef.current.stop();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.phase, cue]);

  const startTake = useCallback(async () => {
    setActiveId(null);
    setMakeError(null);
    await recorder.startRecording();
  }, [recorder]);

  const recordAgain = useCallback(() => {
    setActiveId(null);
    setMakeError(null);
    quietly(devTakeUri);
    setDevTakeUri(null);
    recorder.reset();
    dispatch({ type: 'STEP', step: 'record' });
  }, [devTakeUri, recorder]);

  // ---- make the song ---------------------------------------------------------------------------
  const resultUriRef = useRef<string | null>(null);
  const makeSong = useCallback(async () => {
    if (takeUri === null || song === null || song.key !== flow.key || !cueReady || cue === null) return;
    setActiveId(null);
    setMakeError(null);
    dispatch({ type: 'STEP', step: 'making' });
    await yieldToUi();
    try {
      const started = Date.now();
      const take = decodeWav(await nativeSongIO.readBytes(takeUri));
      const made = await renderBirthdaySong(
        {
          song: song.pcm, take, key: flow.key, syllables: flow.syllables,
          takeSlotStartSec: cue.cue.slotStartSec, takeSlotEndSec: cue.cue.slotEndSec,
        },
        yieldToUi,
      );
      const uri = newWorkFileUri('song');
      await nativeSongIO.writeBytes(uri, encodeWav(made.audio));
      quietly(resultUriRef.current);
      resultUriRef.current = uri;
      setResult({ uri, report: made.report, renderMs: Date.now() - started });
      dispatch({ type: 'STEP', step: 'done' });
    } catch (error) {
      setMakeError(error instanceof NoSingingFoundError ? NO_SINGING_MESSAGE : MAKE_FAILED_MESSAGE);
      dispatch({ type: 'STEP', step: 'record' });
    }
  }, [takeUri, song, flow.key, flow.syllables, cueReady, cue]);

  // ---- going back to the form discards the take: it was sung to a different guide ------------------
  const backToSetup = useCallback(() => {
    setActiveId(null);
    setMakeError(null);
    quietly(devTakeUri);
    setDevTakeUri(null);
    quietly(resultUriRef.current);
    resultUriRef.current = null;
    setResult(null);
    recorder.reset();
    dispatch({ type: 'STEP', step: 'setup' });
  }, [devTakeUri, recorder]);

  // ---- development only: a synthetic voice stands in for a singer, since the emulator mic is silent --
  const importTestTake = useCallback(async () => {
    if (cue === null) return;
    const sr = 22_050;
    const voice = synthesizeTestVoice({ sampleRate: sr, leadSeconds: 0.2, tailSeconds: 0.2, syllableSeconds: 0.3 });
    const samples = new Float32Array(Math.round(cue.cue.durationSec * sr));
    let seed = 7;
    for (let i = 0; i < samples.length; i += 1) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      samples[i] = (seed / 4294967296 - 0.5) * 0.004;
    }
    const start = Math.round((cue.cue.slotStartSec + 0.3) * sr);
    for (let i = 0; i < voice.samples.length && start + i < samples.length; i += 1) samples[start + i] += voice.samples[i];
    const uri = newWorkFileUri('name');
    await nativeSongIO.writeBytes(uri, encodeWav({ sampleRate: sr, samples }));
    quietly(devTakeUri);
    setDevTakeUri(uri);
  }, [cue, devTakeUri]);

  // ---- tidy up: every file this screen wrote is removed when it closes --------------------------------
  const devTakeRef = useRef<string | null>(null);
  devTakeRef.current = devTakeUri;
  useEffect(
    () => () => {
      quietly(cueUriRef.current);
      quietly(resultUriRef.current);
      quietly(devTakeRef.current);
    },
    [],
  );

  return {
    flow,
    dispatch,
    canContinue: canContinueFromSetup(flow),
    consent,
    recorder,
    micLevel: meter.source,
    song: { play: songPlay, error: songError, ready: song !== null && song.key === flow.key },
    cue: { play: cuePlay, ready: cueReady, durationSec: cue?.cue.durationSec ?? 0 },
    take: { uri: takeUri, play: takePlay, synthetic: devTakeUri !== null },
    result,
    resultPlay,
    makeError,
    startTake,
    recordAgain,
    makeSong,
    backToSetup,
    importTestTake,
  };
}
