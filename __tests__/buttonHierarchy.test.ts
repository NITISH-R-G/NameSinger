import * as fs from 'fs';
import * as path from 'path';

import {
  BUTTON_MIN_HEIGHT,
  BUTTON_SPECS,
  resolveButtonColors,
  type ButtonVariant,
} from '../src/theme/buttonStyles';
import { colors, layout, minTouchTarget } from '../src/theme/tokens';
import { contrastRatio } from '../src/utils/accessibility';

const VARIANTS = Object.keys(BUTTON_SPECS) as ButtonVariant[];
const DESTRUCTIVE: ButtonVariant[] = ['destructive', 'destructiveText'];

/** Background a transparent button actually sits on: any card or panel colour used in the app. */
const SURFACES = [colors.surface, colors.surfaceMuted, colors.background];

function backgroundsFor(variant: ButtonVariant, pressed: boolean): string[] {
  const colorsForState = resolveButtonColors(variant, { pressed, inactive: false });
  return colorsForState.background === 'transparent' ? SURFACES : [colorsForState.background];
}

describe('button variants', () => {
  it('defines the full hierarchy', () => {
    expect(VARIANTS.sort()).toEqual(
      ['contextual', 'destructive', 'destructiveText', 'neutral', 'primary', 'secondary'].sort(),
    );
  });

  it.each(VARIANTS)('%s has readable text in its resting and pressed states', (variant) => {
    for (const pressed of [false, true]) {
      const { text } = resolveButtonColors(variant, { pressed, inactive: false });
      for (const background of backgroundsFor(variant, pressed)) {
        expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(VARIANTS)('%s stays legible when disabled or loading (at least 3:1)', (variant) => {
    const { text, background } = resolveButtonColors(variant, { pressed: false, inactive: true });
    for (const surface of background === 'transparent' ? SURFACES : [background]) {
      expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps every button at least 48 dp tall', () => {
    expect(BUTTON_MIN_HEIGHT).toBeGreaterThanOrEqual(48);
    expect(BUTTON_MIN_HEIGHT).toBe(minTouchTarget);
  });

  it('makes forward, supporting, cancel and destructive actions full width, and contextual ones not', () => {
    for (const variant of ['primary', 'secondary', 'neutral', 'destructive', 'destructiveText'] as const) {
      expect(BUTTON_SPECS[variant].fullWidth).toBe(true);
    }
    expect(BUTTON_SPECS.contextual.fullWidth).toBe(false);
  });

  it('uses red only for destructive variants', () => {
    const reds: string[] = [colors.danger, colors.dangerPressed, colors.dangerSurface];
    for (const variant of VARIANTS) {
      const spec = BUTTON_SPECS[variant];
      const usesRed = [spec.background, spec.backgroundPressed, spec.border, spec.text].some((c) =>
        reds.includes(c),
      );
      expect(usesRed).toBe(DESTRUCTIVE.includes(variant));
      expect(spec.destructive).toBe(DESTRUCTIVE.includes(variant));
    }
  });

  it('draws the destructive text button without a fill or border, and the final one solid red', () => {
    expect(BUTTON_SPECS.destructiveText.background).toBe('transparent');
    expect(BUTTON_SPECS.destructiveText.border).toBe('transparent');
    expect(BUTTON_SPECS.destructive.background).toBe(colors.danger);
    expect(BUTTON_SPECS.destructive.text).toBe(colors.onPrimary);
  });

  it('makes cancel grey, not red and not the brand colour', () => {
    expect(BUTTON_SPECS.neutral.background).toBe(colors.neutral);
    expect(BUTTON_SPECS.neutral.background).not.toBe(colors.primary);
    expect(BUTTON_SPECS.neutral.text).toBe(colors.onNeutral);
  });

  it('darkens a solid button when pressed and tints a text button', () => {
    for (const variant of ['primary', 'neutral', 'destructive'] as const) {
      const rest = resolveButtonColors(variant, { pressed: false, inactive: false });
      const pressed = resolveButtonColors(variant, { pressed: true, inactive: false });
      expect(pressed.background).not.toBe(rest.background);
    }
    expect(resolveButtonColors('destructiveText', { pressed: true, inactive: false }).background).toBe(
      colors.dangerSurface,
    );
  });

  it('ignores pressed feedback while inactive', () => {
    expect(resolveButtonColors('primary', { pressed: true, inactive: true })).toEqual(
      resolveButtonColors('primary', { pressed: false, inactive: true }),
    );
  });
});

describe('horizontal layout', () => {
  it('puts a primary button 16 to 20 dp from the screen edge', () => {
    const inset = layout.screenGutter + layout.cardBorderWidth + layout.cardPadding;
    expect(layout.contentInset).toBe(inset);
    expect(inset).toBeGreaterThanOrEqual(16);
    expect(inset).toBeLessThanOrEqual(20);
  });

  it('uses one gap for stacked buttons and for buttons sharing a row', () => {
    expect(layout.buttonGap).toBeGreaterThanOrEqual(8);
  });
});

describe('button usage in source', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const read = (relative: string) => fs.readFileSync(path.join(srcDir, relative), 'utf8');
  const sources = (directory: string): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sources(full);
      return /\.tsx$/.test(entry.name) ? [full] : [];
    });
  const files = sources(srcDir).map((file) => ({
    name: path.relative(srcDir, file).replace(/\\/g, '/'),
    text: fs.readFileSync(file, 'utf8'),
  }));

  it('has no leftover variants from before the hierarchy', () => {
    for (const file of files) {
      expect(file.text).not.toMatch(/variant=\{?["']danger["']/);
      expect(file.text).not.toMatch(/\bbusy=\{/); // renamed to loading
    }
  });

  it('uses the solid destructive button only on the confirmation screen', () => {
    for (const file of files) {
      const uses = /variant=["']destructive["']/.test(file.text);
      expect(uses).toBe(file.name === 'components/ConfirmDestructive.tsx');
    }
  });

  it('shows the consequence before the buttons, with a red confirm and a grey cancel', () => {
    const text = read('components/ConfirmDestructive.tsx');
    expect(text.indexOf('consequences.map')).toBeGreaterThan(-1);
    expect(text.indexOf('consequences.map')).toBeLessThan(text.indexOf('variant="destructive"'));
    expect(text).toContain('variant="neutral"');
    expect(text.indexOf('variant="destructive"')).toBeLessThan(text.indexOf('variant="neutral"'));
  });

  it('keeps destructive text for deleting the user recording behind a confirmation', () => {
    const settings = read('components/SettingsSheet.tsx');
    expect(settings).toContain('variant="destructiveText"');
    expect(settings).toContain('ConfirmDestructive');
    expect(settings).toContain('setConfirmingDelete(true)');
  });

  it('uses contextual buttons for the reply chips and round buttons for the stage controls', () => {
    expect(read('components/Transcript.tsx')).toContain('variant="contextual"');
    expect(read('components/ActionButton.tsx')).toContain('export function IconButton');
  });
});
