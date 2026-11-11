import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { computeEnvelope, createPlaybackLevelDriver, type Envelope } from '../audio/envelope';
import type { LevelSource } from '../audio/levels';
import { nativeSongIO } from '../audio/nativeSongIO';
import { decodeWav } from '../audio/wav';
import { useAppActive } from './useAppActive';

export type SongPlaybackPhase = 'none' | 'loading' | 'stopped' | 'playing' | 'paused' | 'error';

const LOAD_POLL_INTERVAL_MS = 250;
const LOAD_POLL_MAX_ATTEMPTS = 40;

export interface UseSongPlaybackOptions {
  /** The generated song file, or null when there is none. */
  uri: string | null;
  /** Unique id so only one preview or song plays at a time. */
  id: string;
  activeId: string | null;
  onActivate: (id: string | null) => void;
}

export interface UseSongPlaybackResult {
  phase: SongPlaybackPhase;
  /** Play, or pause when playing; resumes from where it was paused. */
  toggle: () => void;
  /** Stops and returns to the start. */
  stop: () => void;
  /**
   * What the orb listens to during playback. It comes only from this song's own samples and the
   * player's position: never from the microphone.
   */
  level: LevelSource;
  /** Whether the song's amplitude envelope is ready. Until then (or if it fails) the level is 0. */
  envelope: 'none' | 'ready' | 'failed';
}

/**
 * Playback of the generated song with an amplitude level that follows the playing audio.
 *
 * expo-audio's per-sample listener on Android needs the RECORD_AUDIO permission, which this app
 * must not depend on for playback, so the level is derived instead: the finished WAV is analysed
 * once into an envelope, and while the player is playing the player's own position
 * (`player.currentTime`, read at each animation frame) is looked up in that envelope. Pausing,
 * stopping, finishing, another sound taking over, or the app leaving the foreground, all drop the
 * level to 0 at once.
 */
export function useSongPlayback({ uri, id, activeId, onActivate }: UseSongPlaybackOptions): UseSongPlaybackResult {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const appActive = useAppActive();
  const [paused, setPaused] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [polledLoaded, setPolledLoaded] = useState(false);
  const [envelopeState, setEnvelopeState] = useState<'none' | 'ready' | 'failed'>('none');
  const envelopeRef = useRef<Envelope | null>(null);
  const busy = useRef(false);

  // Analyse the song once when it appears.
  useEffect(() => {
    envelopeRef.current = null;
    setEnvelopeState('none');
    if (uri === null) return undefined;
    let alive = true;
    void (async () => {
      try {
        const audio = decodeWav(await nativeSongIO.readBytes(uri));
        const envelope = computeEnvelope(audio);
        if (!alive) return;
        envelopeRef.current = envelope;
        setEnvelopeState('ready');
      } catch {
        if (alive) setEnvelopeState('failed');
      }
    })();
    return () => {
      alive = false;
    };
  }, [uri]);

  const driver = useMemo(
    () =>
      createPlaybackLevelDriver({
        envelope: () => envelopeRef.current,
        position: () => player.currentTime,
        schedule: (callback) => requestAnimationFrame(callback),
        cancel: (handle) => cancelAnimationFrame(handle),
        now: () => Date.now(),
      }),
    [player],
  );

  // Follow the player only while it is really playing in the foreground.
  useEffect(() => {
    if (status.playing && appActive) driver.start();
    else driver.stop();
    return () => driver.stop();
  }, [status.playing, appActive, driver]);

  // Another sound (the recorder or the recording preview) took over: stop this one.
  useEffect(() => {
    if (activeId !== id && status.playing) {
      player.pause();
      player.seekTo(0).catch(() => undefined);
      setPaused(false);
    }
  }, [activeId, id, status.playing, player]);

  // Finished by itself.
  useEffect(() => {
    if (status.didJustFinish) setPaused(false);
  }, [status.didJustFinish]);

  // expo-audio starts from the status at creation and then relies on events, so a "loaded" event
  // that fires before its listener attaches is lost. Re-reading the player's status closes that gap.
  useEffect(() => {
    setPolledLoaded(false);
    if (uri === null) return undefined;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      let loaded = false;
      try {
        loaded = player.currentStatus.isLoaded;
      } catch {
        // Released while going away.
      }
      if (loaded) setPolledLoaded(true);
      if (loaded || attempts >= LOAD_POLL_MAX_ATTEMPTS) clearInterval(timer);
    }, LOAD_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [player, uri]);

  const toggle = useCallback(() => {
    if (busy.current || uri === null) return;
    busy.current = true;
    setActionFailed(false);
    void (async () => {
      try {
        if (status.playing) {
          player.pause();
          setPaused(true);
        } else {
          onActivate(id);
          const atEnd =
            status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05);
          if (atEnd) await player.seekTo(0);
          player.play();
          setPaused(false);
        }
      } catch {
        setActionFailed(true);
        onActivate(null);
      } finally {
        busy.current = false;
      }
    })();
  }, [uri, status.playing, status.didJustFinish, status.duration, status.currentTime, player, onActivate, id]);

  const stop = useCallback(() => {
    if (uri === null) return;
    player.pause();
    player.seekTo(0).catch(() => undefined);
    setPaused(false);
    onActivate(null);
  }, [uri, player, onActivate]);

  const hasError = actionFailed || status.error !== null;
  const loaded = status.isLoaded || polledLoaded;
  let phase: SongPlaybackPhase;
  if (uri === null) phase = 'none';
  else if (hasError) phase = 'error';
  else if (status.playing) phase = 'playing';
  else if (paused) phase = 'paused';
  else if (!loaded) phase = 'loading';
  else phase = 'stopped';

  return { phase, toggle, stop, level: driver.source, envelope: envelopeState };
}
