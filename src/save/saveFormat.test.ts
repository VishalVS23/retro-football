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
