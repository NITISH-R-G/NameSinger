import { readFileSync } from 'fs';
import { join } from 'path';

import { ICON_PATHS } from '../src/killa/icons';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const screen = read('src/killa/KillaSongScreen.tsx');
const button = read('src/killa/IconButton.tsx');

describe('icon set', () => {
  it('has every icon the player needs, as vector paths on one 24 unit grid', () => {
    for (const name of ['back', 'replay', 'save', 'saved', 'share', 'play', 'pause', 'close', 'more'] as const) {
      expect(ICON_PATHS[name].length).toBeGreaterThan(10); // a play triangle is a short path
      expect(ICON_PATHS[name]).toMatch(/^M/);
    }
  });

  it('draws every icon in the same 24 x 24 viewBox, not with text characters', () => {
    expect(read('src/killa/icons.tsx')).toContain('viewBox="0 0 24 24"');
    expect(screen).not.toMatch(/[▶⏸✕‹↺⇧⋮]/); // no play, pause, cross, chevron, replay, share or ellipsis glyphs
  });
});

describe('player controls', () => {
  it('makes Replay, Save and Share icon-only buttons with accessibility labels', () => {
    expect(screen).toMatch(/<IconButton[\s\S]*?icon="replay"[\s\S]*?label="Replay from the start"/);
    expect(screen).toMatch(/icon=\{saved \? 'saved' : 'save'\}[\s\S]*?label=\{saved \? 'Saved to Music' : 'Save to Music'\}/);
    expect(screen).toMatch(/icon="share"[\s\S]*?label="Share song"/);
    expect(screen).not.toMatch(/<KillaButton[^>]*label="(Replay|Save|Share|Back|Cancel)"/);
  });

  it('uses an arrow icon for Back and the close icon for Cancel, never a word button', () => {
    expect(screen).toMatch(/icon="back" label="Back"/);
    expect(screen).toMatch(/icon="close" label="Cancel song"/);
    expect(screen).toMatch(/icon="more" label="More options"/);
  });

  it('keeps Generate as the one prominent text-labelled action', () => {
    expect(screen).toMatch(/variant="primary"[\s\S]*?label="Generate song"/);
    expect(screen.match(/variant="primary"/g)?.length).toBe(2); // the Generate plate and the round play/pause button
  });

  it('has a distinct play and pause button with a visible pressed, selected and disabled state', () => {
    expect(screen).toMatch(/icon=\{player\.playing \? 'pause' : 'play'\}/);
    expect(button).toContain('softPressed');
    expect(button).toContain('softSelected');
    expect(button).toContain('disabled && styles.disabled');
    expect(button).toContain('accessibilityState={{ disabled, selected }}');
  });

  it('gives every icon button a touch target of at least 48dp', () => {
    expect(button).toMatch(/const TARGET = 48;/);
  });
});

describe('navigation and record behaviour', () => {
  it('handles the Android hardware/gesture Back: player returns, a running song asks first', () => {
    expect(screen).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(screen).toMatch(/if \(busy\) \{\s*confirmStop\(\);\s*return true;/);
    expect(screen).toMatch(/if \(done\) \{\s*another\(\);\s*return true;/);
  });

  it('spins the record only while a song is being made or played, and eases it to a stop when paused', () => {
    expect(screen).toContain('speed={SPEED_MAKING}');
    expect(screen).toContain('speed={player.playing ? SPEED_PLAYING : 0}');
    expect(screen).toMatch(/SPEED_PLAYING = 100/);
    expect(read('modules/killa-ui/android/src/main/java/ai/jackknife/killayue/Vinyl.java')).toContain('Math.exp(-dt * 3.5)');
  });

  it('draws the record from elapsed time at a constant angular velocity, rotating only the grooves and label', () => {
    const vinyl = read('modules/killa-ui/android/src/main/java/ai/jackknife/killayue/Vinyl.java');
    expect(vinyl).toContain('angle = (angle + rate * dt) % 360f');
    expect(vinyl).toContain('c.rotate(angle, cx, cy)');
    expect(vinyl).not.toMatch(/Killa YuE["' ]*\);/); // no lettering is drawn
  });
});

describe('the frozen pipeline', () => {
  it('did not change the request builder or the engine module in this task', () => {
    const request = read('src/song/songRequest.ts');
    expect(request).toContain('DEFAULT_RENDER_STEPS = 4');
    expect(request).toContain('LM_SEED = 4420344455356672063n');
    expect(read('modules/yue-engine/src/index.ts')).toContain('generate(requestJson: string, outDir: string, tag: string)');
  });
});
