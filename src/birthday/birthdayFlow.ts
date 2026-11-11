import { MAX_SYLLABLES, MIN_SYLLABLES, suggestSyllables, type KeyName } from './score';

/** Where the person is in the birthday flow. Recording and review are one step: the recorder's own phase says which. */
export type BirthdayStep = 'setup' | 'record' | 'making' | 'done';

export const MAX_NAME_LENGTH = 30;

export interface BirthdayFlowState {
  step: BirthdayStep;
  name: string;
  syllables: number;
  /** True once the person has chosen a count themselves; the suggestion then stops following the name. */
  syllablesChosen: boolean;
  key: KeyName;
}

export type BirthdayFlowAction =
  | { type: 'NAME'; name: string }
  | { type: 'SYLLABLES'; count: number }
  | { type: 'KEY'; key: KeyName }
  | { type: 'STEP'; step: BirthdayStep };

export const initialBirthdayFlow: BirthdayFlowState = {
  step: 'setup',
  name: '',
  syllables: 2,
  syllablesChosen: false,
  key: 'mid',
};

export function canContinueFromSetup(state: BirthdayFlowState): boolean {
  return state.name.trim().length > 0;
}

export function birthdayFlowReducer(state: BirthdayFlowState, action: BirthdayFlowAction): BirthdayFlowState {
  switch (action.type) {
    case 'NAME': {
      const name = action.name.slice(0, MAX_NAME_LENGTH);
      return {
        ...state,
        name,
        syllables: state.syllablesChosen ? state.syllables : suggestSyllables(name),
      };
    }
    case 'SYLLABLES': {
      const count = Math.max(MIN_SYLLABLES, Math.min(MAX_SYLLABLES, Math.round(action.count)));
      return { ...state, syllables: count, syllablesChosen: true };
    }
    case 'KEY':
      return { ...state, key: action.key };
    case 'STEP':
      // The record step needs a name; nothing else is allowed to skip ahead without one either.
      if (action.step !== 'setup' && !canContinueFromSetup(state)) return state;
      return { ...state, step: action.step };
    default:
      return state;
  }
}
