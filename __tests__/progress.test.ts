import { START_PROGRESS, STEP_COUNT, parseProgress } from '../src/song/progress';

describe('honest generation progress', () => {
  it('starts at step 0 with no detail', () => {
    expect(parseProgress([])).toEqual(START_PROGRESS);
    expect(parseProgress(['[Server] Listening on 127.0.0.1:8087'])).toEqual(START_PROGRESS);
  });

  it('reports the most advanced stage seen, newest line first', () => {
    const lines = ['[Store] Load LM: 3826 ms', '[AR] Score 12/200', '[AR] Semantic 40/303', '[NAR] Step 2/4, 26130 ms'];
    const p = parseProgress(lines);
    expect(p.stage).toBe('rendering');
    expect(p.step).toBe(3);
    expect(p.detail).toBe('Render pass 2 of 4');
  });

  it('only gives a count where the engine reports a real one', () => {
    expect(parseProgress(['[AR] Semantic 40/303']).detail).toBeNull();
    expect(parseProgress(['[AR] Score 3/90']).detail).toBeNull();
    expect(parseProgress(['[VAE] Decoded']).detail).toBeNull();
  });

  it('never invents a percentage or fraction', () => {
    for (const l of ['[AR] Score 3/90', '[AR] Semantic 40/303', '[NAR] Step 1/4', '[VAE] x', '[MP3] x']) {
      const p = parseProgress([l]) as unknown as Record<string, unknown>;
      expect(p).not.toHaveProperty('fraction');
      expect(p).not.toHaveProperty('percent');
    }
  });

  it('keeps steps within the four shown to the user', () => {
    for (const l of ['[Store] Load LM', '[AR] Score 1/9', '[AR] Semantic 1/9', '[NAR] Step 1/4', '[VAE] x', '[MP3] x']) {
      const { step } = parseProgress([l]);
      expect(step).toBeGreaterThanOrEqual(1);
      expect(step).toBeLessThanOrEqual(STEP_COUNT);
    }
  });

  it('clamps a render count that overshoots its total', () => {
    expect(parseProgress(['[NAR] Step 9/4']).detail).toBe('Render pass 4 of 4');
  });
});
