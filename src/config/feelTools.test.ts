import { describe, expect, it } from 'vitest';
import { applyOverrides, diffFromDefaults, formatFeel, listEntries, sliderRange } from './feelTools';
import { feel } from './feel';

const sample = () => ({ camera: { leadYards: 4, followLerp: 0.12 }, pocket: { sackTime: 3 } });

describe('feelTools', () => {
  it('lists every setting with its group', () => {
    expect(listEntries(sample())).toEqual([
      { group: 'camera', key: 'leadYards', value: 4 },
      { group: 'camera', key: 'followLerp', value: 0.12 },
      { group: 'pocket', key: 'sackTime', value: 3 },
    ]);
  });

  it('formats settings as pasteable code, without float noise', () => {
    const f = sample();
    f.camera.followLerp = 0.1 + 0.2; // 0.30000000000000004
    expect(formatFeel(f)).toBe(
      [
        'export const feel = {',
        '  camera: {',
        '    leadYards: 4,',
        '    followLerp: 0.3,',
        '  },',
        '  pocket: {',
        '    sackTime: 3,',
        '  },',
        '};',
      ].join('\n'),
    );
  });

  it('applies saved overrides but ignores unknown or broken values', () => {
    const f = sample();
    applyOverrides(f, {
      camera: { leadYards: 6, madeUp: 1, followLerp: 'fast' },
      nope: { x: 1 },
    });
    expect(f).toEqual({ camera: { leadYards: 6, followLerp: 0.12 }, pocket: { sackTime: 3 } });
    applyOverrides(f, null);
    applyOverrides(f, 'garbage');
    expect(f.camera.leadYards).toBe(6);
  });

  it('remembers only what changed', () => {
    const f = sample();
    f.pocket.sackTime = 2.5;
    expect(diffFromDefaults(f, sample())).toEqual({ pocket: { sackTime: 2.5 } });
  });

  it('gives every real setting a slider range that contains its default', () => {
    for (const { key, value } of listEntries(feel)) {
      const r = sliderRange(key, value);
      expect(value).toBeGreaterThanOrEqual(r.min);
      expect(value).toBeLessThanOrEqual(r.max);
      expect(r.step).toBeGreaterThan(0);
    }
  });
});
