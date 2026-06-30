import { describe, expect, it } from 'vitest';
import { getAtlasPageAabb, parseAtlasRegions } from './downloadAttachment';

const SAMPLE_ATLAS = `page1.png
size: 640, 480
format: RGBA8888
filter: Linear, Linear
repeat: none
pma: true
dagger
bounds: 372, 100, 26, 108
head
index: 0
bounds: 2, 21, 103, 81
rotate: 90
`;

describe('parseAtlasRegions', () => {
  it('parses rotated region with bounds on atlas page (axis-aligned, not swapped)', () => {
    const regions = parseAtlasRegions(SAMPLE_ATLAS);
    const head = regions.find((r) => r.name === 'head');
    expect(head).toBeDefined();
    expect(head!.degrees).toBe(90);
    expect(head!.bounds).toEqual({ x: 2, y: 21, width: 103, height: 81 });
    expect(getAtlasPageAabb(head!)).toEqual({ x: 2, y: 21, width: 103, height: 81 });
  });

  it('parses multiple properties on one line', () => {
    const atlas = `page.png
size: 100, 100
format: RGBA8888
filter: Linear, Linear
foo
index: 0 bounds: 1, 2, 30, 40 rotate: 90
`;
    const regions = parseAtlasRegions(atlas);
    expect(regions).toHaveLength(1);
    expect(regions[0].name).toBe('foo');
    expect(regions[0].bounds).toEqual({ x: 1, y: 2, width: 30, height: 40 });
    expect(regions[0].degrees).toBe(90);
  });
});
