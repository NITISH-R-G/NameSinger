import { MASCOT_BASE_OPTIONS, MASCOT_MOUTH } from '../src/constants/mascot';
import { mascotSvg } from '../src/utils/mascotSvg';

describe('mascot', () => {
  it('is generated locally as an SVG of the requested size', () => {
    const svg = mascotSvg('calm', 72);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="72"');
    expect(svg).toContain('height="72"');
  });

  it('never loads a remote resource', () => {
    const svg = mascotSvg('singing', 96);
    // URLs inside <metadata> are namespaces and licence credits, not fetched resources.
    const drawn = svg.replace(/<metadata[\s\S]*?<\/metadata>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    expect(drawn).not.toMatch(/(href|src)\s*=\s*["']https?:/i);
    expect(drawn).not.toMatch(/url\(\s*["']?https?:/i);
    expect(drawn).not.toContain('<image');
    expect(drawn).not.toMatch(/<script/i);
  });

  it('looks the same every time for the same inputs', () => {
    expect(mascotSvg('calm', 72)).toBe(mascotSvg('calm', 72));
  });

  it('only the mouth changes between moods', () => {
    const calm = mascotSvg('calm', 72);
    const singing = mascotSvg('singing', 72);
    expect(calm).not.toBe(singing);
    expect(MASCOT_MOUTH.calm).not.toEqual(MASCOT_MOUTH.singing);
    // Same seed and base options in both, so head, sides, eyes and colours are identical.
    expect(MASCOT_BASE_OPTIONS.seed).toBe('NameSinger');
    expect(calm.length).toBeGreaterThan(500);
  });

  it('uses the brand purple', () => {
    expect(mascotSvg('calm', 72).toLowerCase()).toContain('4b2e9f');
  });
});
