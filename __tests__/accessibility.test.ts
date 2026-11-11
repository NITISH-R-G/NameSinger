import * as fs from 'fs';
import * as path from 'path';

import { LANGUAGES } from '../src/constants/languages';
import { colors, minTouchTarget } from '../src/theme/tokens';
import type { RecorderPhase } from '../src/types';
import {
  announcementForPhase,
  buttonA11y,
  contrastRatio,
  languageOptionA11y,
  PHASE_ANNOUNCEMENTS,
  playbackPositionLabel,
} from '../src/utils/accessibility';

describe('buttonA11y', () => {
  it('describes a real button with its visible label', () => {
    const props = buttonA11y({ label: 'Record my name', hint: 'Starts the microphone' });
    expect(props.accessible).toBe(true);
    expect(props.accessibilityRole).toBe('button');
    expect(props.accessibilityLabel).toBe('Record my name');
    expect(props.accessibilityHint).toBe('Starts the microphone');
    expect(props.accessibilityState).toEqual({ disabled: false, busy: false });
  });

  it('reports disabled and busy state to assistive technology', () => {
    expect(buttonA11y({ label: 'x', disabled: true }).accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });
    expect(buttonA11y({ label: 'x', busy: true }).accessibilityState).toEqual({
      disabled: false,
      busy: true,
    });
  });
});

describe('languageOptionA11y', () => {
  it.each(LANGUAGES.map((language) => [language.englishName, language] as const))(
    '%s is a radio with a spoken English name',
    (_name, language) => {
      const unselected = languageOptionA11y(language, false);
      expect(unselected.accessibilityRole).toBe('radio');
      expect(unselected.accessibilityLabel).toBe(language.englishName);
      expect(unselected.accessibilityState).toEqual({ selected: false, checked: false });
      const selected = languageOptionA11y(language, true);
      expect(selected.accessibilityState).toEqual({ selected: true, checked: true });
    },
  );
});

describe('announcementForPhase', () => {
  it('speaks the phases a user needs to know about', () => {
    expect(announcementForPhase('recording', null)).toBe(PHASE_ANNOUNCEMENTS.recording);
    expect(announcementForPhase('recorded', null)).toBe(PHASE_ANNOUNCEMENTS.recorded);
    expect(announcementForPhase('approved', null)).toBe(PHASE_ANNOUNCEMENTS.approved);
    expect(announcementForPhase('permission-denied', null)).toBe(
      PHASE_ANNOUNCEMENTS['permission-denied'],
    );
  });

  it('speaks the error message, or a fixed fallback', () => {
    expect(announcementForPhase('error', 'Custom message')).toBe('Custom message');
    expect(announcementForPhase('error', null)).toBe(PHASE_ANNOUNCEMENTS.fallbackError);
  });

  it.each<RecorderPhase>(['idle', 'requesting-permission', 'stopping'])(
    'stays silent for %s',
    (phase) => {
      expect(announcementForPhase(phase, null)).toBeNull();
    },
  );
});

describe('playbackPositionLabel', () => {
  it('reads position and length', () => {
    expect(playbackPositionLabel(3, 65)).toBe('Position 0:03 of 1:05');
  });
  it('says so when the length is not known yet', () => {
    expect(playbackPositionLabel(0, 0)).toBe('Position 0:00, length not known yet');
  });
});

describe('colour contrast (WCAG AA, 4.5:1 for normal text)', () => {
  it('computes known reference ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });

  const pairs: Array<[string, string, string]> = [
    ['ink on background', colors.ink, colors.background],
    ['ink on surface', colors.ink, colors.surface],
    ['ink on surfaceMuted', colors.ink, colors.surfaceMuted],
    ['inkMuted on background', colors.inkMuted, colors.background],
    ['inkMuted on surface', colors.inkMuted, colors.surface],
    ['inkMuted on surfaceMuted', colors.inkMuted, colors.surfaceMuted],
    ['primary on surface', colors.primary, colors.surface],
    ['onPrimary on primary', colors.onPrimary, colors.primary],
    ['onPrimary on danger', colors.onPrimary, colors.danger],
    ['danger on surface', colors.danger, colors.surface],
    ['danger on surfaceMuted', colors.danger, colors.surfaceMuted],
    ['danger on dangerSurface', colors.danger, colors.dangerSurface],
    ['ink on dangerSurface', colors.ink, colors.dangerSurface],
    ['success on successSurface', colors.success, colors.successSurface],
    ['accent on surface', colors.accent, colors.surface],
  ];

  it.each(pairs)('%s', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('touch targets', () => {
  it('uses a minimum target of at least 48 dp', () => {
    expect(minTouchTarget).toBeGreaterThanOrEqual(48);
  });
});

/** Static scan of component source: there is no React test renderer in this project. */
describe('interactive elements in source', () => {
  const srcDir = path.join(__dirname, '..', 'src');

  function sourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx$/.test(entry.name) ? [full] : [];
    });
  }

  const files = sourceFiles(srcDir).map((file) => ({
    name: path.relative(srcDir, file).replace(/\\/g, '/'),
    text: fs.readFileSync(file, 'utf8'),
  }));

  it('finds the component files', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it('never attaches onPress to a View, Text or Image', () => {
    for (const file of files) {
      expect(file.text).not.toMatch(/<(View|Text|Image)\b[^>]*\bonPress\b/);
    }
  });

  it('only builds Pressables in the button components, the orb surface, the sheet and the selectors, each labelled', () => {
    const withPressable = files.filter((file) => /<Pressable\b/.test(file.text));
    expect(withPressable.map((file) => file.name).sort()).toEqual([
      'components/ActionButton.tsx',
      'components/ConfirmDestructive.tsx',
      'components/OrbSurface.tsx',
      'components/SettingsSheet.tsx',
      'components/glass/GlassBottomSheet.tsx',
      'components/glass/GlassIconButton.tsx',
      'components/glass/GlassThemeSelector.tsx',
    ]);
    // Every one of them names itself for a screen reader.
    for (const file of withPressable) {
      expect(file.text).toMatch(/accessibilityRole="(button|radio)"|\{\.\.\.buttonA11y\(/);
      expect(file.text).toMatch(/accessibilityLabel=|\{\.\.\.buttonA11y\(/);
    }
    const button = files.find((file) => file.name === 'components/ActionButton.tsx');
    const orb = files.find((file) => file.name === 'components/OrbSurface.tsx');
    expect(button?.text).toContain('{...buttonA11y(');
    expect(orb?.text).toContain('accessibilityRole="button"');
    expect(orb?.text).toContain('accessibilityLabel=');
  });

  it('does not use deprecated Touchable components', () => {
    for (const file of files) {
      expect(file.text).not.toMatch(/Touchable(Opacity|Highlight|WithoutFeedback)/);
    }
  });

  it('does not put a live region on text that ticks while recording', () => {
    for (const file of files) {
      expect(file.text).not.toContain('accessibilityLiveRegion');
    }
  });

  it('marks the brand and every settings card title as a heading', () => {
    const screen = files.find((file) => file.name === 'components/ConversationScreen.tsx');
    const settings = files.find((file) => file.name === 'components/SettingsSheet.tsx');
    expect(screen?.text).toContain('accessibilityRole="header"'); // the wordmark
    expect(settings?.text.match(/accessibilityRole="header"/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('reports expanded or collapsed on the button that shows more details', () => {
    expect(buttonA11y({ label: 'More details', expanded: false }).accessibilityState).toMatchObject({
      expanded: false,
    });
    expect(buttonA11y({ label: 'Hide details', expanded: true }).accessibilityState).toMatchObject({
      expanded: true,
    });
    expect(buttonA11y({ label: 'Play' }).accessibilityState).not.toHaveProperty('expanded');
  });

  it('never renders a raw error message in the UI', () => {
    for (const file of files) {
      expect(file.text).not.toMatch(/\{(error|errorText|actionError)\.message\}/);
      expect(file.text).not.toMatch(/status\.error\}/);
    }
  });
});
