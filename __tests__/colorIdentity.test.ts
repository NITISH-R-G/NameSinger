import * as fs from 'fs';
import * as path from 'path';

import { getGlassRenderer, isNativeLiquidGlassAvailable } from '../src/native/liquid-glass';
import { ORB_PALETTES, ORB_THEME_IDS } from '../src/orb/orbPalettes';
import { buildGlass, buildPalette } from '../src/theme/buildTheme';
import { contrastRatio, mix, readableOn, withAlpha } from '../src/theme/colorMath';
import { darkColors, darkGlass, glassFor, lightColors, lightGlass, paletteFor, type Palette } from '../src/theme/colors';

const root = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const files = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    return entry.isDirectory() ? files(rel) : /\.tsx?$/.test(entry.name) ? [rel] : [];
  });

const SCHEMES = ['light', 'dark'] as const;

function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('the semantic token set', () => {
  const required: (keyof Palette)[] = [
    'accent', 'accentStrong', 'accentSoft', 'accentMuted', 'accentForeground', 'onAccent', 'selection', 'focusRing',
    'glassTint', 'glassHighlight', 'glassBorder', 'orbPrimary', 'orbSecondary', 'orbHighlight',
    'ink', 'inkMuted', 'background', 'surface', 'surfaceElevated', 'border', 'disabled', 'onDisabled', 'danger', 'onDanger',
  ];

  it('every palette in both schemes defines every token, as a real colour', () => {
    for (const id of ORB_THEME_IDS) {
      for (const scheme of SCHEMES) {
        const palette = buildPalette(scheme, id);
        for (const key of required) {
          expect(`${id}/${scheme}/${key}=${palette[key]}`).toMatch(/=(#[0-9A-F]{6}|rgba\([\d., ]+\))$/);
        }
      }
    }
  });

  it('the orb is the source of truth: orb tokens are the orb palette, the accent is the orb palette accent', () => {
    for (const id of ORB_THEME_IDS) {
      for (const scheme of SCHEMES) {
        const palette = buildPalette(scheme, id);
        expect(palette.accent).toBe(ORB_PALETTES[id].accent[scheme]);
        expect(palette.orbPrimary).toBe(ORB_PALETTES[id].base[1]);
        expect(palette.orbSecondary).toBe(ORB_PALETTES[id].base[2]);
        expect(palette.orbHighlight).toBe(ORB_PALETTES[id].base[0]);
        // The legacy names that old components still read are the accent, so nothing stays violet.
        expect(palette.primary).toBe(palette.accent);
        expect(palette.primaryPressed).toBe(palette.accentStrong);
        expect(palette.onPrimary).toBe(palette.onAccent);
      }
    }
  });

  it('each palette has its own colour family, so choosing it changes the whole interface', () => {
    const family: Record<string, [number, number]> = {
      aurora: [245, 280],
      ocean: [185, 215],
      sunset: [0, 25],
      emerald: [150, 170],
      rose: [320, 345],
      glacier: [220, 240],
      solar: [28, 48],
      amethyst: [262, 285],
    };
    for (const id of ORB_THEME_IDS) {
      for (const scheme of SCHEMES) {
        const h = hue(buildPalette(scheme, id).accent);
        const [lo, hi] = family[id];
        if (h < lo || h > hi) throw new Error(`${id}/${scheme} accent hue ${h.toFixed(0)} is outside ${lo}-${hi}`);
      }
    }
    expect(new Set(ORB_THEME_IDS.map((id) => buildPalette('light', id).accent)).size).toBe(8);
    expect(new Set(ORB_THEME_IDS.map((id) => buildPalette('dark', id).accent)).size).toBe(8);
  });

  it('switching the orb changes the accent, selection, focus ring, glass tint and orb tokens together, and nothing else about readability', () => {
    const a = buildPalette('light', 'ocean');
    const b = buildPalette('light', 'sunset');
    for (const key of ['accent', 'accentStrong', 'accentSoft', 'accentMuted', 'selection', 'focusRing', 'glassTint', 'glassBorder', 'orbPrimary', 'orbSecondary', 'orbHighlight'] as const) {
      expect(a[key]).not.toBe(b[key]);
    }
    expect(buildGlass('light', 'ocean').tint).not.toBe(buildGlass('light', 'sunset').tint);
    expect(buildGlass('dark', 'ocean').rimGlow).not.toBe(buildGlass('dark', 'sunset').rimGlow);
  });

  it('changing Light, Dark or System never changes the orb: the orb is an input, the scheme is another', () => {
    for (const id of ORB_THEME_IDS) {
      expect(buildPalette('light', id).orbPrimary).toBe(buildPalette('dark', id).orbPrimary);
    }
    expect(paletteFor('dark', 'emerald').accent).toBe(ORB_PALETTES.emerald.accent.dark);
    expect(paletteFor('light', 'emerald').accent).toBe(ORB_PALETTES.emerald.accent.light);
  });

  it('keeps body text neutral: it is never the accent colour', () => {
    for (const id of ORB_THEME_IDS) {
      for (const scheme of SCHEMES) {
        const p = buildPalette(scheme, id);
        expect(p.ink).not.toBe(p.accent);
        expect(p.inkMuted).not.toBe(p.accent);
      }
    }
  });
});

describe('contrast for every palette in both schemes (WCAG AA)', () => {
  const pairs: [keyof Palette, keyof Palette, number][] = [
    ['ink', 'background', 7],
    ['ink', 'surface', 7],
    ['ink', 'surfaceElevated', 7],
    ['ink', 'surfaceMuted', 7],
    ['ink', 'field', 7],
    ['ink', 'accentSoft', 7],
    ['inkMuted', 'background', 4.5],
    ['inkMuted', 'surface', 4.5],
    ['inkMuted', 'surfaceMuted', 4.5],
    ['inkMuted', 'accentSoft', 4.5],
    ['placeholder', 'field', 4.5],
    ['onAccent', 'accent', 4.5],
    ['onAccent', 'accentStrong', 4.5],
    ['accentForeground', 'background', 4.5],
    ['accentForeground', 'surface', 4.5],
    ['accentForeground', 'surfaceElevated', 4.5],
    ['onNeutral', 'neutral', 4.5],
    ['onNeutral', 'neutralPressed', 4.5],
    ['onDanger', 'danger', 4.5],
    ['onDanger', 'dangerPressed', 4.5],
    ['danger', 'background', 4.5],
    ['danger', 'surface', 4.5],
    ['danger', 'dangerSurface', 4.5],
    ['success', 'successSurface', 4.5],
    ['onDisabled', 'disabled', 3],
  ];

  for (const id of ORB_THEME_IDS) {
    for (const scheme of SCHEMES) {
      it(`${id}, ${scheme}`, () => {
        const palette = buildPalette(scheme, id);
        for (const [fg, bg, min] of pairs) {
          const ratio = contrastRatio(palette[fg] as string, palette[bg] as string);
          if (ratio < min) throw new Error(`${id}/${scheme}: ${fg} on ${bg} is ${ratio.toFixed(2)}, needs ${min}`);
        }
      });
    }
  }

  it('Light and Dark are separate designs, not an inversion', () => {
    expect(lightColors.background).not.toBe(darkColors.background);
    expect(contrastRatio(darkColors.background, '#000000')).toBeLessThan(1.5);
    expect(contrastRatio(lightColors.background, '#FFFFFF')).toBeLessThan(1.2);
    expect(darkColors.ink).not.toBe('#FFFFFF');
    expect(darkColors.background).not.toBe('#000000');
    for (const id of ORB_THEME_IDS) {
      // The accent is deep on light and luminous on dark.
      expect(contrastRatio(buildPalette('light', id).accent, '#FFFFFF')).toBeGreaterThan(contrastRatio(buildPalette('dark', id).accent, '#FFFFFF'));
    }
  });
});

describe('glass tokens', () => {
  const alpha = (rgba: string) => Number(rgba.match(/([\d.]+)\)$/)?.[1]);

  it('are built per scheme and per orb', () => {
    expect(glassFor('dark')).toEqual(darkGlass);
    expect(glassFor('light')).toEqual(lightGlass);
    expect(glassFor('dark', 'rose')).not.toEqual(glassFor('dark', 'ocean'));
  });

  it('stay translucent: the default fill shows the page through it, only text surfaces are dense', () => {
    for (const id of ORB_THEME_IDS) {
      for (const scheme of SCHEMES) {
        const glass = buildGlass(scheme, id);
        expect(alpha(glass.fill)).toBeLessThanOrEqual(0.5);
        expect(alpha(glass.fillStrong)).toBeGreaterThanOrEqual(0.88);
        expect(alpha(glass.tint)).toBeLessThanOrEqual(0.25); // the palette tint is restrained
      }
    }
  });

  it('Light is clear and bright, Dark is deeper with a restrained highlight, designed apart', () => {
    expect(lightGlass.highlightAlpha).toBeGreaterThan(darkGlass.highlightAlpha);
    expect(lightGlass.blurTint).toBe('light');
    expect(darkGlass.blurTint).toBe('dark');
    expect(lightGlass.highlight).toBe('#FFFFFF');
    expect(darkGlass.highlight).not.toBe('#FFFFFF'); // tinted by the palette, not white
    expect(alpha(lightGlass.shadow)).toBeLessThan(alpha(darkGlass.shadow));
  });

  it('pick up the orb colour in their reflections and edges', () => {
    for (const id of ORB_THEME_IDS) {
      const glass = buildGlass('dark', id);
      expect(glass.bounce).toContain(`${parseInt(ORB_PALETTES[id].accent.dark.slice(1, 3), 16)}, `);
    }
  });
});

describe('colour maths', () => {
  it('mixes, applies alpha and picks a readable foreground', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030');
    expect(withAlpha('#FF8000', 0.5)).toBe('rgba(255, 128, 0, 0.5)');
    expect(readableOn('#FFFFFF')).toBe('#14102A');
    expect(readableOn('#101010')).toBe('#FFFFFF');
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });
});

describe('no hard-coded identity colours survive', () => {
  const sourceFiles = [...files('src/components'), ...files('src/app'), ...files('src/conversation'), 'src/theme/ThemeProvider.tsx', 'src/theme/useTheme.ts'];
  /** The old fixed violet identity, and the old fixed light surfaces. None may appear outside the palette files. */
  const banned = ['#4B2E9F', '#3A2380', '#6A4DFF', '#BBA8FF', '#A68FFF', '#7C74F6', '#4A38DE', '#1E1285', '#F1EEF8', '#F4F0F5', '#0D0B16', '#1E1B2E', '#FBF6EE', '#C2410C'];

  it('no component, screen or provider contains a banned literal', () => {
    for (const file of sourceFiles) {
      const text = read(file);
      for (const literal of banned) {
        if (text.toUpperCase().includes(literal)) throw new Error(`${file} still contains ${literal}`);
      }
    }
  });

  it('components hold no colour literals at all, except white for SVG highlights and the glass-orb body bases that are mixed with the accent', () => {
    for (const file of sourceFiles.filter((f) => f.startsWith('src/components') || f.startsWith('src/app'))) {
      const literals = (code(file).match(/#[0-9A-Fa-f]{6}\b/g) ?? []).filter((l) => l.toUpperCase() !== '#FFFFFF');
      if (file.endsWith('GlassOrb.tsx')) {
        // Only as the first argument of mix(): neutral bases that lean toward the accent.
        const quoted = (code(file).match(/'#[0-9A-Fa-f]{6}'/g) ?? []).filter((l) => l.toUpperCase() !== "'#FFFFFF'");
        expect(quoted.length).toBe((code(file).match(/mix\('#[0-9A-Fa-f]{6}'/g) ?? []).length);
        continue;
      }
      if (literals.length > 0) throw new Error(`${file}: ${literals.join(', ')}`);
    }
  });

  it('no component imports the static palette', () => {
    for (const file of sourceFiles.filter((f) => f.startsWith('src/components'))) {
      expect(code(file)).not.toMatch(/\b(lightColors|darkColors)\b/);
      expect(code(file)).not.toMatch(/import \{[^}]*\bcolors\b[^}]*\} from '\.\.\/(\.\.\/)?theme\/tokens'/);
    }
  });

  it('the whole palette is derived in one place, from the orb', () => {
    const build = code('src/theme/buildTheme.ts');
    expect(build).toContain('ORB_PALETTES[orbTheme]');
    expect(build).toContain('orb.accent[scheme]');
    expect(code('src/theme/ThemeProvider.tsx')).toContain('paletteFor(scheme, appearance.orbTheme)');
  });

  it('changing the orb colours washes once across the interface and never touches the conversation', () => {
    const provider = code('src/theme/ThemeProvider.tsx');
    expect(provider).toContain('const wash = useRef(new Animated.Value(0)).current;');
    expect(provider).toContain('useNativeDriver: true');
    expect(provider).toContain('colors.accent');
    for (const file of ['src/conversation/useConversation.ts', 'src/hooks/useNameRecorder.ts', 'src/hooks/useSongPlayback.ts', 'src/speech/useAssistantSpeech.ts']) {
      expect(code(file)).not.toMatch(/useTheme|orbTheme/);
    }
  });
});

describe('how the glass is drawn', () => {
  const surface = read('src/components/glass/GlassSurface.tsx');
  const surfaceCode = code('src/components/glass/GlassSurface.tsx');
  const screen = code('src/components/ConversationScreen.tsx');

  it('uses real backdrop blur through one shared blur target, and says what is not real', () => {
    expect(surfaceCode).toContain("from 'expo-blur'");
    expect(surfaceCode).toContain('blurTarget={target ?? undefined}');
    expect(surfaceCode).toContain('blurMethod="dimezisBlurViewSdk31Plus"');
    expect(code('src/components/glass/GlassBackdrop.tsx')).toContain('<BlurTargetView');
    expect(surface).toContain('no optical refraction');
    expect(surface).toContain('(simulated)');
  });

  it('builds the layers of a pane: blur, fill, palette reflections, specular, bounce, an angled rim, layered shadows', () => {
    // Fallback renderer: blur, fill, one soft top highlight, one hairline rim, one soft shadow.
    for (const layer of ['<BlurView', 'gs-top', 'gs-rim']) expect(surfaceCode).toContain(layer);
    expect(surfaceCode).toMatch(/boxShadow: `0 6 20 /);
    // The native renderer takes its tint, glow and specular colour from the palette-derived tokens.
    for (const token of ['r.tintStrong', 'r.glow', 'r.specularColor']) expect(surfaceCode).toContain(token);
    expect(surfaceCode).toContain('<RefractiveGlassView');
  });

  it('lets a highlight move with the surface (the sheet sweeps a sheen as it rises)', () => {
    expect(surfaceCode).toContain('sheen');
    expect(code('src/components/glass/GlassBottomSheet.tsx')).toContain('sheen={sheen}');
  });

  it('draws the page the glass blurs (ambient colour scene and the orb) inside the blur target', () => {
    expect(screen).toContain('<AmbientScene />');
    expect(screen).toContain('{orbLayer}');
    expect(screen).toContain('<GlassBackdrop');
    // The foreground never blocks the orb beneath it.
    expect(screen).toContain('pointerEvents="box-none"');
  });

  it('does not freeze the orb or filter the page: the backdrop blur replaces both', () => {
    expect(screen).not.toMatch(/filter:\s*\[/);
    expect(screen).not.toMatch(/paused=/);
    expect(code('src/components/VoiceOrb.tsx')).not.toMatch(/paused/);
  });

  it('keeps glass to the functional layer: the grouped header controls, the composer field, sheets and dialogs', () => {
    expect(screen.match(/<GlassSurface/g)).toBeNull(); // no glass box around the conversation
    expect(screen).toContain('<GlassControlGroup>');
    expect(code('src/components/Composer.tsx')).toContain('<GlassSurface radius={26}');
    expect(code('src/components/ConfirmDestructive.tsx')).toContain('<GlassSurface strong');
    expect(code('src/components/SettingsSheet.tsx')).toContain('<GlassBottomSheet');
  });

  it('settings and the confirmation are in the tree (not a separate window), so the blur and theme reach them', () => {
    expect(code('src/components/SettingsSheet.tsx')).not.toMatch(/<Modal/);
    expect(code('src/components/ConfirmDestructive.tsx')).not.toMatch(/<Modal/);
  });

  it('is honest about the renderer: an approximation with real blur, never claimed as AndroidLiquidGlass', () => {
    // Without the native module (jest, Expo Go, iOS) the renderer is the approximation and says so.
    expect(getGlassRenderer()).toEqual({ kind: 'rn-approximation', refractsBackdrop: false });
    expect(isNativeLiquidGlassAvailable).toBe(false);
    expect(code('src/native/liquid-glass/index.ts')).toContain("kind: 'agsl-refraction', refractsBackdrop: true");
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    for (const name of ['@callstack/liquid-glass', '@expo/ui', 'react-native-reanimated', '@shopify/react-native-skia']) {
      expect(Object.keys(pkg.dependencies)).not.toContain(name);
    }
    expect(Object.keys(pkg.dependencies)).toContain('expo-blur');
  });

  it('the composer shows a focus ring in the accent', () => {
    const composer = code('src/components/Composer.tsx');
    expect(composer).toContain('borderColor: colors.focusRing');
    expect(composer).toContain('selectionColor={colors.accent}');
  });
});
