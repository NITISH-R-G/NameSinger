import {
  MAX_NAME_LENGTH,
  birthdayFlowReducer,
  canContinueFromSetup,
  initialBirthdayFlow,
  type BirthdayFlowState,
} from '../src/birthday/birthdayFlow';

const run = (actions: Parameters<typeof birthdayFlowReducer>[1][], from: BirthdayFlowState = initialBirthdayFlow) =>
  actions.reduce(birthdayFlowReducer, from);

describe('birthday flow', () => {
  it('starts on the form with the middle key and cannot continue without a name', () => {
    expect(initialBirthdayFlow.step).toBe('setup');
    expect(initialBirthdayFlow.key).toBe('mid');
    expect(canContinueFromSetup(initialBirthdayFlow)).toBe(false);
    expect(run([{ type: 'STEP', step: 'record' }]).step).toBe('setup');
    expect(run([{ type: 'NAME', name: '   ' }, { type: 'STEP', step: 'record' }]).step).toBe('setup');
  });

  it('suggests a syllable count from the name until the person chooses one', () => {
    expect(run([{ type: 'NAME', name: 'Maria' }]).syllables).toBe(3);
    const chosen = run([{ type: 'NAME', name: 'Maria' }, { type: 'SYLLABLES', count: 2 }, { type: 'NAME', name: 'Alexandra' }]);
    expect(chosen.syllables).toBe(2); // the person's own choice is kept
  });

  it('keeps the syllable count between 1 and 5', () => {
    expect(run([{ type: 'SYLLABLES', count: 0 }]).syllables).toBe(1);
    expect(run([{ type: 'SYLLABLES', count: 9 }]).syllables).toBe(5);
  });

  it('limits the name length and moves through the steps once a name is set', () => {
    const long = run([{ type: 'NAME', name: 'x'.repeat(100) }]);
    expect(long.name).toHaveLength(MAX_NAME_LENGTH);
    const s = run([{ type: 'NAME', name: 'Sam' }, { type: 'KEY', key: 'high' }, { type: 'STEP', step: 'record' }]);
    expect(s).toMatchObject({ step: 'record', key: 'high', name: 'Sam', syllables: 1 });
    expect(birthdayFlowReducer(s, { type: 'STEP', step: 'setup' }).step).toBe('setup');
  });
});
