import type { AccessibilityState } from 'react-native';

import { formatDuration } from '../hooks/recorderState';
import type { Language, RecorderPhase } from '../types';

/** Accessibility props for a real button (a Pressable). Pure so it can be unit-tested. */
export interface ButtonA11y {
  accessible: true;
  accessibilityRole: 'button';
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityState: AccessibilityState;
}

export function buttonA11y(input: {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
  /** For buttons that show or hide something: reported as expanded or collapsed. */
  expanded?: boolean;
}): ButtonA11y {
  return {
    accessible: true,
    accessibilityRole: 'button',
    accessibilityLabel: input.label,
    accessibilityHint: input.hint,
    accessibilityState: {
      disabled: input.disabled === true,
      busy: input.busy === true,
      ...(input.expanded === undefined ? {} : { expanded: input.expanded }),
    },
  };
}

export interface RadioA11y {
  accessible: true;
  accessibilityRole: 'radio';
  accessibilityLabel: string;
  accessibilityState: AccessibilityState;
}

/**
 * The spoken label is the English name: screen readers read native-script text with the
 * wrong voice unless a language is set, and the visible native name stays on screen.
 */
export function languageOptionA11y(language: Language, selected: boolean): RadioA11y {
  return {
    accessible: true,
    accessibilityRole: 'radio',
    accessibilityLabel: language.englishName,
    accessibilityState: { selected, checked: selected },
  };
}

/** Fixed text spoken when the recorder changes phase. null means stay silent. */
export const PHASE_ANNOUNCEMENTS = {
  recording: 'Recording started. Say your name.',
  recorded: 'Recording saved. You can play it, record again, or use it.',
  approved: 'Name approved.',
  'permission-denied': 'Microphone access was not allowed. You can try again.',
  'permission-blocked': 'Microphone access is blocked. Open settings to allow it.',
  fallbackError: 'Something went wrong while recording.',
} as const;

export function announcementForPhase(
  phase: RecorderPhase,
  errorMessage: string | null,
): string | null {
  switch (phase) {
    case 'recording':
      return PHASE_ANNOUNCEMENTS.recording;
    case 'recorded':
      return PHASE_ANNOUNCEMENTS.recorded;
    case 'approved':
      return PHASE_ANNOUNCEMENTS.approved;
    case 'permission-denied':
      return PHASE_ANNOUNCEMENTS['permission-denied'];
    case 'permission-blocked':
      return PHASE_ANNOUNCEMENTS['permission-blocked'];
    case 'unusable':
      return errorMessage ?? PHASE_ANNOUNCEMENTS.fallbackError;
    case 'error':
      return errorMessage ?? PHASE_ANNOUNCEMENTS.fallbackError;
    default:
      // idle, requesting-permission and stopping change too quickly to be worth speaking.
      return null;
  }
}

export function playbackPositionLabel(currentSeconds: number, durationSeconds: number): string {
  const position = formatDuration(currentSeconds * 1000);
  if (durationSeconds <= 0) return `Position ${position}, length not known yet`;
  return `Position ${position} of ${formatDuration(durationSeconds * 1000)}`;
}

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (offset: number): number => {
    const srgb = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two #RRGGBB colours (1 to 21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
