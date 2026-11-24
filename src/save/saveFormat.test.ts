import { describe, expect, it } from 'vitest';
import {
  MAX_BACKUPS,
  SAVE_VERSION,
  SaveError,
  createNewSave,
  exportFileName,
  migrate,
  parseSave,
  rotateBackups,
  serializeSave,
} from './saveFormat';
import { newSeason } from '../league/season';
import { TEAM_DEFS } from '../league/teams';

const fixedDate = new Date('2026-11-14T12:00:00Z');

describe('save format', () => {
  it('creates a new save with the current version', () => {
    const s = createNewSave(42, fixedDate);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.seed).toBe(42);
    expect(s.rngState).toBe(42);
    expect(s.sessions).toBe(0);
    expect(s.createdAt).toBe('2026-11-14T12:00:00.000Z');
  });

  it('4a: a version 3 save upgrades with no season yet; a saved season loads back; a damaged one is dropped', () => {
    const { season: _drop, stats: _drop2, ...v3 } = { ...createNewSave(9, fixedDate), version: 3 };
    const up = migrate(v3);
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.season).toBeNull();
    // 4b: version 5 adds the stats store (empty for older saves).
    expect(up.stats).toEqual({ boxes: {}, history: [], grouped: true });
    expect(migrate({ ...createNewSave(9, fixedDate), stats: 'junk' }).stats).toEqual({ boxes: {}, history: [], grouped: true });
    const season = newSeason(TEAM_DEFS, 1, 123);
    expect(migrate({ ...createNewSave(9, fixedDate), season }).season).toEqual(season);
    expect(migrate({ ...createNewSave(9, fixedDate), season: { ...season, games: [] } }).season).toBeNull();
  });

  it('version 6: difficulty; older saves play on Normal, junk = Normal, Hard loads back', () => {
    const { difficulty: _d, ...v5 } = { ...createNewSave(9, fixedDate), version: 5 };
    expect(migrate(v5).difficulty).toBe('normal');
    expect(createNewSave(9, fixedDate).difficulty).toBe('normal');
    expect(migrate({ ...createNewSave(9, fixedDate), difficulty: 'impossible' }).difficulty).toBe('normal');
    expect(migrate({ ...createNewSave(9, fixedDate), difficulty: 'hard' }).difficulty).toBe('hard');
  });

  it('survives a round trip through a file', () => {
    const s = createNewSave(7, fixedDate);
    expect(parseSave(serializeSave(s))).toEqual(s);
  });

  it('rejects junk with a friendly message', () => {
    expect(() => parseSave('not json')).toThrow(SaveError);
    expect(() => parseSave('[1,2,3]')).toThrow(SaveError);
    expect(() => parseSave('{"hello":"world"}')).toThrow(SaveError);
    expect(() => migrate(null)).toThrow(SaveError);
  });

  it('rejects saves from a newer game version', () => {
    const s = { ...createNewSave(1, fixedDate), version: SAVE_VERSION + 1 };
    expect(() => migrate(s)).toThrow(/newer version/);
  });

  it('rejects damaged saves', () => {
    const s = createNewSave(1, fixedDate);
    expect(() => migrate({ ...s, seed: -5 })).toThrow(SaveError);
    expect(() => migrate({ ...s, sessions: 'lots' })).toThrow(SaveError);
    expect(() => migrate({ ...s, createdAt: 'yesterday-ish' })).toThrow(SaveError);
  });

  it('keeps only the newest backups', () => {
    let backups: ReturnType<typeof createNewSave>[] = [];
    for (let i = 0; i < 5; i++) backups = rotateBackups(backups, createNewSave(i, fixedDate));
    expect(backups).toHaveLength(MAX_BACKUPS);
    expect(backups.map((b) => b.seed)).toEqual([4, 3, 2]);
  });

  it('names export files by date', () => {
    expect(exportFileName(new Date(2026, 10, 4))).toBe('retro-football-save-2026-11-04.json');
  });
});
