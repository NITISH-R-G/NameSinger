import * as fs from 'fs';
import * as path from 'path';

import { shouldCloseSheet } from '../src/components/glass/GlassBottomSheet';
import {
  indexForPosition,
  settleIndex,
  ARC_GAP,
  SELECTED_SIZE,
  SMALL_SIZE,
} from '../src/components/glass/GlassThemeSelector';
import {
  DEFAULT_ORB_THEME,
  ORB_PALETTE_LIST,
  ORB_PALETTES,
  ORB_THEME_IDS,
  isOrbThemeId,
  swatchColors,
} from '../src/orb/orbPalettes';
import {
  DEFAULT_APPEARANCE,
  loadAppearance,
  parseAppearance,
  resolveScheme,
  saveAppearance,
  serializeAppearance,
  type AppearanceStorePort,
} from '../src/theme/appearance';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function memoryPort(initial: string | null = null) {
  const state = { text: initial, writes: 0 };
  const port: AppearanceStorePort = {
    read: async () => state.text,
    write: async (text) => {
      state.text = text;
      state.writes += 1;
    },
  };
  return { port, state };
}

describe('System, Light and Dark', () => {
  it('System follows the phone; Light and Dark ignore it', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('treats an unknown phone setting as light', () => {
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });
});

describe('appearance persistence', () => {
  it('first launch has no file: System and the Aurora orb', async () => {
    const { port } = memoryPort(null);
    expect(await loadAppearance(port)).toEqual(DEFAULT_APPEARANCE);
    expect(DEFAULT_APPEARANCE).toEqual({ themePreference: 'system', orbTheme: 'aurora' });
  });

  it('survives a restart: what was saved is what loads', async () => {
    const { port } = memoryPort(null);
    expect(await saveAppearance(port, { themePreference: 'dark', orbTheme: 'sunset' })).toBe(true);
    // A new session reads the same stored text.
    expect(await loadAppearance(port)).toEqual({ themePreference: 'dark', orbTheme: 'sunset' });
  });

  it('every orb theme and every colour mode round-trips', () => {
    for (const orbTheme of ORB_THEME_IDS) {
      for (const themePreference of ['system', 'light', 'dark'] as const) {
        expect(parseAppearance(serializeAppearance({ themePreference, orbTheme }))).toEqual({ themePreference, orbTheme });
      }
    }
  });

  it('a corrupt or unexpected file falls back to the defaults and never throws', () => {
    for (const text of ['{', 'null', '42', '"dark"', '[]', '']) {
      expect(parseAppearance(text)).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it('a bad field loses only itself', () => {
    expect(parseAppearance('{"themePreference":"dark","orbTheme":"nope"}')).toEqual({
      themePreference: 'dark',
      orbTheme: DEFAULT_ORB_THEME,
    });
    expect(parseAppearance('{"themePreference":"purple","orbTheme":"ocean"}')).toEqual({
      themePreference: 'system',
      orbTheme: 'ocean',
    });
  });

  it('a failed read gives the defaults and a failed write is reported, not thrown', async () => {
    const broken: AppearanceStorePort = {
      read: async () => {
        throw new Error('disk');
      },
      write: async () => {
        throw new Error('disk');
      },
    };
    expect(await loadAppearance(broken)).toEqual(DEFAULT_APPEARANCE);
    expect(await saveAppearance(broken, DEFAULT_APPEARANCE)).toBe(false);
  });

  it('stores only the two choices and a version: no name, no audio, no voice', () => {
    const stored = JSON.parse(serializeAppearance({ themePreference: 'light', orbTheme: 'rose' })) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['orbTheme', 'themePreference', 'version']);
  });

  it('lives in the document directory next to the consent record, outside the recording folder', () => {
    const file = read('src/theme/appearanceFile.ts');
    expect(file).toContain('Paths.document');
    expect(file).toContain("'namesinger-appearance.json'");
    expect(code('src/theme/appearanceFile.ts')).not.toMatch(/recording|cache/i);
  });
});

describe('orb palettes', () => {
  it('has the eight designed identities, in order', () => {
    expect([...ORB_THEME_IDS]).toEqual(['aurora', 'ocean', 'sunset', 'emerald', 'rose', 'glacier', 'solar', 'amethyst']);
    expect(ORB_PALETTE_LIST).toHaveLength(8);
    expect(DEFAULT_ORB_THEME).toBe('aurora');
  });

  it('gives each a full layered system: four body colours, a glow, a depth shade and six cloud colours', () => {
    for (const palette of ORB_PALETTE_LIST) {
      expect(palette.base).toHaveLength(4);
      expect(Object.keys(palette.clouds).sort()).toEqual(['indigo', 'mist', 'sky', 'violet', 'white', 'wisp']);
      for (const colour of [...palette.base, palette.fallback, palette.glow, palette.depth, ...Object.values(palette.clouds)]) {
        expect(colour).toMatch(/^#[0-9A-F]{6}$/);
      }
      expect(palette.name.length).toBeGreaterThan(2);
      expect(palette.colorWords.length).toBeGreaterThan(5);
    }
  });

  it('keeps the original orb as Aurora, unchanged', () => {
    expect(ORB_PALETTES.aurora.base).toEqual(['#CFE0FF', '#7C74F6', '#4A38DE', '#271A98']);
    expect(ORB_PALETTES.aurora.glow).toBe('#8C7DFF');
  });

  it('makes the identities visibly different: no two share a body colour or a mid tone', () => {
    const mids = ORB_PALETTE_LIST.map((p) => p.base[1]);
    expect(new Set(mids).size).toBe(8);
    const seen = new Set<string>();
    for (const palette of ORB_PALETTE_LIST) {
      const key = palette.base.join();
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('runs light to dark from top to bottom, so the sphere keeps its depth in every palette', () => {
    for (const palette of ORB_PALETTE_LIST) {
      const [top, mid, low, bottom] = palette.base.map(luminance);
      expect(top).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(bottom);
      expect(low).toBeGreaterThanOrEqual(bottom);
    }
  });

  it('validates a stored id and offers three swatch colours', () => {
    expect(isOrbThemeId('ocean')).toBe(true);
    expect(isOrbThemeId('violet')).toBe(false);
    expect(isOrbThemeId(3)).toBe(false);
    expect(swatchColors('emerald')).toHaveLength(3);
  });
});

describe('orb theme is independent of audio, recording and voice', () => {
  const sources = [
    'src/audio/levels.ts',
    'src/audio/envelope.ts',
    'src/audio/renderSong.ts',
    'src/audio/generateSong.ts',
    'src/hooks/useNameRecorder.ts',
    'src/hooks/useSongPlayback.ts',
    'src/hooks/recordingController.ts',
    'src/conversation/conversation.ts',
    'src/conversation/useConversation.ts',
    'src/speech/assistantSpeech.ts',
    'src/speech/useAssistantSpeech.ts',
    'src/orb/orbState.ts',
  ];

  it('no audio, recording, conversation or speech module knows about themes', () => {
    for (const file of sources) {
      expect(code(file)).not.toMatch(/useTheme|ThemeProvider|orbTheme|orbPalettes|setOrbTheme|themePreference/);
    }
  });

  it('keeps voice separate: nothing in the theme or palette code names a voice, speech or pitch', () => {
    for (const file of ['src/theme/appearance.ts', 'src/theme/ThemeProvider.tsx', 'src/orb/orbPalettes.ts']) {
      expect(code(file)).not.toMatch(/expo-speech|Speech\.|pitch|rate:|voiceId|voiceIdentity/);
    }
    expect(Object.keys(DEFAULT_APPEARANCE).sort()).toEqual(['orbTheme', 'themePreference']);
  });

  it('the orb blends palettes with opacity only, on the native driver, and keeps its clouds spinning', () => {
    const orb = code('src/components/VoiceOrb.tsx');
    expect(orb).toContain('function useOrbMorph');
    expect(orb).toMatch(/Animated\.timing\(blend,[\s\S]*useNativeDriver: true/);
    expect(orb).toContain('<PaletteBody');
    // Both layers share the same spin values, so the flow never restarts during a change.
    expect(orb.match(/spins=\{spins\}/g)).toHaveLength(2);
    // The motion code is not keyed on the theme.
    expect(orb).not.toMatch(/\[[^\]]*orbTheme[^\]]*\]\);\s*\n\s*\/\/ State changes ease/);
  });

  it('the orb does not remount when the theme changes (it is never keyed by the theme)', () => {
    for (const file of ['src/components/ConversationScreen.tsx', 'src/components/OrbSurface.tsx']) {
      expect(code(file)).not.toMatch(/key=\{[^}]*orbTheme/);
    }
  });

  it('theme changes are locked while the microphone is open', () => {
    const screen = read('src/components/ConversationScreen.tsx');
    expect(screen).toContain('<GlassThemeSelector selected={orbTheme} onSelect={setOrbTheme} disabled={microphoneBusy} />');
    expect(screen).toMatch(/label="Orb colours"[\s\S]*?disabled=\{microphoneBusy\}/);
    expect(read('src/components/SettingsSheet.tsx')).toContain('disabled={microphoneBusy}');
    expect(read('src/components/glass/GlassThemeSelector.tsx')).toContain('Colours are locked while the microphone is open.');
  });
});

describe('theme provider', () => {
  const provider = code('src/theme/ThemeProvider.tsx');

  it('is the one place that holds the preference and the orb theme, and saves them', () => {
    expect(provider).toContain('saveAppearance(port, appearance)');
    expect(provider).toContain('loadAppearance(port)');
    expect(provider).toContain('useColorScheme()');
  });

  it('does not save the initial load, only changes the user made', () => {
    expect(provider).toContain('dirty.current = true');
    expect(provider).toContain('!dirty.current');
  });

  it('changes the colour mode with a dissolve that does not remount anything, and with no animation under reduced motion', () => {
    expect(provider).toContain('DIP_MS');
    expect(provider).toContain('useNativeDriver: true');
    expect(provider).toMatch(/if \(reduced\) \{\s*setApplied\(target\);/);
    // The children are rendered once, in the same position, whichever scheme is showing.
    expect(provider).not.toMatch(/key=\{.*scheme/);
  });

  it('shows no flash of the wrong scheme before the saved choice is read', () => {
    expect(provider).toContain('if (!loaded) return <View');
  });

  it('is mounted at the root, with a status bar that follows the scheme', () => {
    const layout = read('src/app/_layout.tsx');
    expect(layout).toContain('<ThemeProvider>');
    expect(layout).toContain("scheme === 'dark' ? 'light' : 'dark'");
    expect(JSON.parse(read('app.json')).expo.userInterfaceStyle).toBe('automatic');
  });
});

describe('every screen follows the theme', () => {
  const themed = [
    'ConversationScreen',
    'Transcript',
    'Composer',
    'SettingsSheet',
    'ConsentSettings',
    'ConfirmDestructive',
    'OpeningScreen',
    'AppShell',
    'ActionButton',
  ];

  it('no themed component imports the static light palette', () => {
    for (const name of themed) {
      expect(code(`src/components/${name}.tsx`)).not.toMatch(/import \{[^}]*\bcolors\b[^}]*\} from '\.\.\/theme\/tokens'/);
    }
  });

  it('no themed component hard-codes a surface, text or border colour', () => {
    const allowed = /#(?:6B6678)/; // none expected; kept explicit so a new literal is a conscious choice
    for (const name of ['ConversationScreen', 'Transcript', 'Composer', 'SettingsSheet', 'ConsentSettings', 'ConfirmDestructive', 'AppShell']) {
      const literals = (code(`src/components/${name}.tsx`).match(/'#[0-9A-Fa-f]{3,8}'|"#[0-9A-Fa-f]{3,8}"/g) ?? []).filter(
        (l) => !allowed.test(l),
      );
      expect(literals).toEqual([]);
    }
  });

  it('settings offers System, Light and Dark as a labelled radio group, 48 dp tall', () => {
    const settings = read('src/components/SettingsSheet.tsx');
    expect(settings).toContain('accessibilityRole="radiogroup"');
    expect(settings).toContain('accessibilityRole="radio"');
    expect(settings).toContain("{ system: 'System', light: 'Light', dark: 'Dark' }");
    expect(settings).toContain('minHeight: 48');
  });

  it('modals read the theme through context, so a settings or confirmation screen in a Modal is themed too', () => {
    expect(code('src/components/SettingsSheet.tsx')).toContain('useThemedStyles(makeStyles)');
    expect(code('src/components/ConfirmDestructive.tsx')).toContain('useThemedStyles(makeStyles)');
  });

  it('the opening screen has a dark glass variant and takes its colours from the chosen orb', () => {
    const opening = read('src/components/OpeningScreen.tsx');
    expect(opening).toContain('backgroundColor: colors.background');
    const glassOrb = read('src/components/GlassOrb.tsx');
    expect(glassOrb).toContain("glassTone(scheme === 'dark', colors.accent)");
    expect(glassOrb).toContain('ORB_PALETTES[orbTheme]'); // the orb palette still colours the glass (was: 'const accent = orb.glow;', before the glass orb was rewritten)
  });
});

describe('the bottom sheet', () => {
  const sheet = code('src/components/glass/GlassBottomSheet.tsx');

  it('closes on a long or fast downward drag of the handle, and springs back otherwise', () => {
    expect(shouldCloseSheet(200, 0, 400)).toBe(true);
    expect(shouldCloseSheet(30, 0, 400)).toBe(false);
    expect(shouldCloseSheet(10, 1.2, 400)).toBe(true);
    expect(shouldCloseSheet(-50, -2, 400)).toBe(false);
  });

  it('closes with the Android back button, a tap on the dimmed page and a Done button', () => {
    expect(sheet).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(sheet).toContain('onPress={onClose}');
    expect(sheet).toContain('Done');
    expect(sheet).toContain('accessibilityViewIsModal');
  });

  it('moves on the native driver, springs open, and skips the motion under reduced motion', () => {
    expect(sheet).toContain('Animated.spring(progress');
    expect(sheet).toContain('useNativeDriver: true');
    expect(sheet).toMatch(/reduced\s*\?\s*Animated\.timing\(progress, \{ toValue: visible \? 1 : 0, duration: 0/);
  });

  it('removes its listeners and animation on close and unmount', () => {
    expect(sheet).toContain('subscription.remove()');
    expect(sheet).toContain('return () => animation.stop()');
  });
});

describe('the orb colour chooser', () => {
  const selector = code('src/components/glass/GlassThemeSelector.tsx');

  it('maps a scroll position to a theme and clamps it to the list', () => {
    expect(indexForPosition(-2)).toBe(0);
    expect(indexForPosition(2.4)).toBe(2);
    expect(indexForPosition(2.6)).toBe(3);
    expect(indexForPosition(99)).toBe(7);
  });

  it('settles on the next theme in the direction of a flick', () => {
    expect(settleIndex(2.2, 0)).toBe(2);
    expect(settleIndex(2.2, -3)).toBe(3); // up moves forward
    expect(settleIndex(2.2, 3)).toBe(1);
    expect(settleIndex(0.1, 5)).toBe(0);
    expect(settleIndex(6.9, -5)).toBe(7);
  });

  it('makes the selected orb clearly larger than the others', () => {
    expect(SELECTED_SIZE / SMALL_SIZE).toBeGreaterThan(1.5);
    expect(ARC_GAP).toBeGreaterThan(SMALL_SIZE);
  });

  it('is an accessible radio group with every orb a labelled radio, and increment and decrement actions', () => {
    expect(selector).toContain('accessibilityRole="radiogroup"');
    expect(selector).toContain('accessibilityRole="radio"');
    expect(selector).toContain('accessibilityLabel={`${palette.name}, ${palette.colorWords}`}');
    expect(selector).toContain("{ name: 'increment' }, { name: 'decrement' }");
  });

  it('works without any swipe: tapping an orb selects it', () => {
    expect(selector).toContain('onPress={() => goTo(index)}');
  });

  it('tells the user it changes only how the orb looks, not the assistant voice', () => {
    expect(selector).toContain('voice stays the same.');
    expect(selector).toContain('only change how the orb looks');
  });

  it('removes its position listener on unmount', () => {
    expect(selector).toContain('position.removeListener(id)');
  });
});
