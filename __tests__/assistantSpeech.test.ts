import * as fs from 'fs';
import * as path from 'path';

import { createAssistantSpeech, type SpeechPort } from '../src/speech/assistantSpeech';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

type Handlers = Parameters<SpeechPort['speak']>[1];

/** A speech engine whose events the test controls. */
function fakeEngine() {
  const spoken: { text: string; handlers: Handlers }[] = [];
  const stops = { count: 0 };
  const port: SpeechPort = {
    speak: (text, handlers) => {
      spoken.push({ text, handlers });
    },
    stop: () => {
      stops.count += 1;
    },
  };
  return { port, spoken, stops, current: () => spoken[spoken.length - 1] };
}

/** A controllable timer so the word-pulse decay and the start watchdog are deterministic. */
function fakeTimers() {
  let next = 1;
  const pending = new Map<number, { at: number; cb: () => void }>();
  let now = 0;
  return {
    schedule: (cb: () => void, ms: number) => {
      const id = next++;
      pending.set(id, { at: now + ms, cb });
      return id;
    },
    cancel: (handle: unknown) => {
      pending.delete(handle as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(id);
          timer.cb();
        }
      }
    },
    pending: () => pending.size,
  };
}

function setup() {
  const engine = fakeEngine();
  const timers = fakeTimers();
  const speech = createAssistantSpeech(engine.port, { schedule: timers.schedule, cancel: timers.cancel });
  return { engine, timers, speech };
}

describe('assistant speech', () => {
  it('speaks the exact text it is given', () => {
    const { engine, speech } = setup();
    expect(speech.speak("Hi, I'm NameSinger. What's your name?")).toBe(true);
    expect(engine.spoken.map((s) => s.text)).toEqual(["Hi, I'm NameSinger. What's your name?"]);
    expect(speech.status()).toBe('speaking');
  });

  it('says several messages in order, one at a time, each after the previous one finished', () => {
    const { engine, speech } = setup();
    speech.speak('one');
    speech.speak('two');
    speech.speak('three');
    expect(engine.spoken.map((s) => s.text)).toEqual(['one']);
    engine.current().handlers.onDone();
    expect(engine.spoken.map((s) => s.text)).toEqual(['one', 'two']);
    engine.current().handlers.onDone();
    engine.current().handlers.onDone();
    expect(engine.spoken.map((s) => s.text)).toEqual(['one', 'two', 'three']);
    expect(speech.status()).toBe('idle');
  });

  it('interrupting stops the current utterance and drops what was queued', () => {
    const { engine, speech } = setup();
    speech.speak('one');
    speech.speak('two');
    speech.stop();
    expect(engine.stops.count).toBe(1);
    expect(speech.status()).toBe('idle');
    // The engine reports the old utterance finished late: it must not start the dropped one.
    engine.spoken[0].handlers.onDone();
    expect(engine.spoken).toHaveLength(1);
  });

  it('stopping when nothing is speaking does nothing to the engine', () => {
    const { engine, speech } = setup();
    speech.stop();
    expect(engine.stops.count).toBe(0);
  });

  it('can speak again after being interrupted', () => {
    const { engine, speech } = setup();
    speech.speak('one');
    speech.stop();
    speech.speak('again');
    expect(engine.current().text).toBe('again');
    expect(speech.status()).toBe('speaking');
  });

  it('speaks nothing when voice mode is off, and says so to the caller', () => {
    const { engine, speech } = setup();
    speech.setEnabled(false);
    expect(speech.speak('hello')).toBe(false);
    expect(engine.spoken).toHaveLength(0);
  });

  it('turning voice mode off stops the current speech at once', () => {
    const { engine, speech } = setup();
    speech.speak('hello');
    speech.setEnabled(false);
    expect(engine.stops.count).toBe(1);
    expect(speech.status()).toBe('idle');
    speech.setEnabled(true);
    expect(speech.speak('back')).toBe(true);
  });

  it('ignores empty text', () => {
    const { engine, speech } = setup();
    expect(speech.speak('   ')).toBe(false);
    expect(engine.spoken).toHaveLength(0);
  });

  it('reports status changes to listeners and stops reporting after unsubscribe', () => {
    const { engine, speech } = setup();
    const seen: string[] = [];
    const off = speech.subscribeStatus((s) => seen.push(s));
    speech.speak('hello');
    engine.current().handlers.onDone();
    off();
    speech.speak('more');
    expect(seen).toEqual(['speaking', 'idle']);
  });
});

describe('the assistant speech level (real word events only)', () => {
  it('is zero until the engine reports a word, then pulses and falls back to zero', () => {
    const { engine, timers, speech } = setup();
    speech.speak('hello there');
    expect(speech.level.get()).toBe(0);
    engine.current().handlers.onWord?.(5);
    expect(speech.level.get()).toBeGreaterThan(0.4);
    timers.advance(200);
    expect(speech.level.get()).toBe(0);
  });

  it('a longer word pulses a little harder, capped', () => {
    const { engine, speech } = setup();
    speech.speak('x');
    engine.current().handlers.onWord?.(2);
    const short = speech.level.get();
    engine.current().handlers.onWord?.(12);
    expect(speech.level.get()).toBeGreaterThan(short);
    engine.current().handlers.onWord?.(100);
    expect(speech.level.get()).toBeLessThanOrEqual(0.9);
  });

  it('does not invent motion: with no word events the level stays at zero while speaking', () => {
    const { timers, speech } = setup();
    speech.speak('hello');
    timers.advance(1000);
    expect(speech.status()).toBe('speaking');
    expect(speech.level.get()).toBe(0);
  });

  it('drops to zero when speech finishes or is stopped, and ignores late word events', () => {
    const { engine, speech } = setup();
    speech.speak('hello');
    const first = engine.current();
    first.handlers.onWord?.(5);
    speech.stop();
    expect(speech.level.get()).toBe(0);
    first.handlers.onWord?.(5);
    expect(speech.level.get()).toBe(0);
  });

  it('is its own source: it has no connection to the microphone or playback code', () => {
    const code = read('src/speech/assistantSpeech.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/createMicMeter|createPlaybackLevelDriver|expo-audio/);
  });
});

describe('when speech is not available', () => {
  it('one engine error retries the same text once after a short pause, so the first question is not lost', () => {
    const { engine, timers, speech } = setup();
    speech.speak('hello');
    speech.speak('queued');
    engine.current().handlers.onError();
    expect(speech.unavailable()).toBe(false);
    expect(speech.status()).toBe('speaking'); // waiting to retry, not idle
    timers.advance(800);
    expect(engine.spoken.map((u) => u.text)).toEqual(['hello', 'hello']);
    engine.current().handlers.onStart();
    engine.current().handlers.onDone();
    expect(engine.current().text).toBe('queued');
  });

  it('two failures in a row switch to text only, and nothing more is attempted', () => {
    const { engine, timers, speech } = setup();
    speech.speak('one');
    speech.speak('two');
    engine.current().handlers.onError();
    timers.advance(800);
    engine.current().handlers.onError();
    expect(speech.unavailable()).toBe(true);
    expect(speech.status()).toBe('idle');
    expect(speech.speak('later')).toBe(false);
    expect(engine.spoken).toHaveLength(2);
  });

  it('a successful utterance in between resets the count', () => {
    const { engine, timers, speech } = setup();
    speech.speak('one');
    engine.current().handlers.onError();
    timers.advance(800); // the retry of 'one'
    engine.current().handlers.onStart();
    engine.current().handlers.onDone();
    speech.speak('three');
    engine.current().handlers.onError();
    expect(speech.unavailable()).toBe(false);
  });

  it('an engine that never starts is not left "speaking": the utterance is dropped after the timeout', () => {
    const { engine, timers, speech } = setup();
    speech.speak('hello');
    expect(speech.status()).toBe('speaking');
    timers.advance(8100);
    expect(speech.unavailable()).toBe(false); // one slow start is tolerated
    expect(engine.stops.count).toBe(1);
    timers.advance(800);
    expect(engine.spoken.map((u) => u.text)).toEqual(['hello', 'hello']); // and retried
  });

  it('two start timeouts in a row make speech unavailable', () => {
    const { timers, speech } = setup();
    speech.speak('one');
    timers.advance(8100);
    timers.advance(800);
    timers.advance(8100);
    expect(speech.unavailable()).toBe(true);
    expect(speech.status()).toBe('idle');
  });

  it('an engine that does start is not timed out', () => {
    const { engine, timers, speech } = setup();
    speech.speak('hello');
    engine.current().handlers.onStart();
    timers.advance(9000);
    expect(speech.status()).toBe('speaking');
    expect(speech.unavailable()).toBe(false);
  });

  it('clears its timers when speech finishes', () => {
    const { engine, timers, speech } = setup();
    speech.speak('hello');
    engine.current().handlers.onStart();
    engine.current().handlers.onDone();
    expect(timers.pending()).toBe(0);
  });
});

describe('the real engine and its lifecycle', () => {
  const port = read('src/speech/expoSpeechPort.ts');
  const hook = read('src/speech/useAssistantSpeech.ts');

  it('uses the phone\'s own text to speech: no network, no prerecorded audio, no hosted API', () => {
    expect(port).toContain("from 'expo-speech'");
    expect(port).toContain('Speech.speak(text,');
    expect(port).not.toMatch(/fetch\(|XMLHttpRequest|require\(['"]\.\.\/\.\.\/assets|\.wav|\.mp3/);
  });

  it('stops speaking when voice mode closes, when the app leaves the foreground and on unmount', () => {
    expect(hook).toContain('speech.setEnabled(enabled)');
    expect(hook).toContain('if (!appActive) speech.stop();');
    expect(hook).toContain('useEffect(() => () => speech.stop(), [speech]);');
  });

  it('reports speaking from the engine, not from a timer', () => {
    expect(hook).toContain('useSyncExternalStore(speech.subscribeStatus, speech.status)');
  });
});
