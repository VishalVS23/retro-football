import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createNewSave, migrate, parseSave, serializeSave } from './saveFormat';
import { generateLeague } from '../league/league';
import { isFreshGame, sanitizeSavedGame, type SavedGame } from './savedGame';
import { newClock } from '../sim/clock';
import { newGame } from '../sim/drive';
import { newGameStats } from '../sim/gameStats';
import { feel } from '../config/feel';

const fixedDate = new Date('2026-11-21T12:00:00Z');

function midGame(): SavedGame {
  const stats = newGameStats();
  stats.us.plays = 23;
  stats.qb.completions = 9;
  stats.byQuarter.us = [7, 7, 0, 0];
  stats.byQuarter.them = [3, 7, 0, 0];
  return {
    match: { ...newGame(), ballX: 52, down: 2, firstDownX: 58, us: 14, them: 10 },
    clock: { ...newClock(feel.clock), quarter: 3, timeLeft: 72, running: true, timeouts: 2 },
    stats,
    playIndex: 3,
  };
}

describe('game in progress', () => {
  it('a version-1 save upgrades with no game in progress and no league yet', () => {
    const v1 = { version: 1, seed: 5, rngState: 99, createdAt: fixedDate.toISOString(), updatedAt: fixedDate.toISOString(), sessions: 4 };
    const s = migrate(v1);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.game).toBeNull();
    expect(s.league).toBeNull();
    expect(s.rngState).toBe(99);
    expect(s.sessions).toBe(4);
  });

  it('a version-2 save keeps its game in progress (opponent picked later) and gets no league yet', () => {
    const v2 = { version: 2, seed: 5, rngState: 99, createdAt: fixedDate.toISOString(), updatedAt: fixedDate.toISOString(), sessions: 4, game: midGame() };
    const s = migrate(v2);
    expect(s.game).toEqual(midGame());
    expect(s.game?.opponentId).toBeUndefined();
    expect(s.league).toBeNull();
  });

  it('a whole league survives a round trip through a file, and a damaged one is dropped', () => {
    const league = { ...generateLeague(3), userTeamId: 7 };
    const save = { ...createNewSave(3, fixedDate), league, game: { ...midGame(), opponentId: 12 } };
    const back = parseSave(serializeSave(save));
    expect(back.league).toEqual(league);
    expect(back.game?.opponentId).toBe(12);
    expect(migrate({ ...save, league: { teams: [] } }).league).toBeNull();
  });

  it('survives a round trip through a file exactly', () => {
    const save = { ...createNewSave(7, fixedDate), game: midGame() };
    const back = parseSave(serializeSave(save));
    expect(back.game).toEqual(midGame());
  });

  it('keeps the overtime period', () => {
    const g = midGame();
    g.clock = { ...g.clock, quarter: 4, timeLeft: 0, ot: 2 };
    g.stats.byQuarter.us.push(7, 0);
    expect(sanitizeSavedGame(g)?.clock.ot).toBe(2);
  });

  it('drops a damaged game but keeps the rest of the save', () => {
    const save = createNewSave(7, fixedDate);
    const bad = [
      { ...midGame(), match: { ...midGame().match, down: 7 } },
      { ...midGame(), clock: { ...midGame().clock, timeLeft: 'lots' } },
      { ...midGame(), stats: { us: {} } },
      { ...midGame(), match: { ...midGame().match, oppStartX: 40 } }, // CPU drive still to come
      'hello',
      [1, 2],
    ];
    for (const game of bad) {
      const s = migrate({ ...save, game });
      expect(s.game).toBeNull();
      expect(s.seed).toBe(7);
    }
  });

  it("keeps each player's line so far (4b-2); an older save has none; a damaged one is dropped", () => {
    const g = { ...midGame(), lines: { us: { 12: { pa: 10, pc: 7, py: 88 } }, them: { 40: { tk: 3, sck: 1 } } } };
    expect(sanitizeSavedGame(JSON.parse(JSON.stringify(g)))?.lines).toEqual(g.lines);
    expect(sanitizeSavedGame(midGame())?.lines).toBeUndefined();
    const bad = sanitizeSavedGame({ ...midGame(), lines: { us: { 12: { pa: 'ten' } }, them: {} } });
    expect(bad).not.toBeNull();
    expect(bad?.lines).toBeUndefined();
  });

  it('falls back to the first play if the playbook got smaller', () => {
    expect(sanitizeSavedGame(midGame(), 2)?.playIndex).toBe(0);
    expect(sanitizeSavedGame(midGame(), 6)?.playIndex).toBe(3);
  });

  it('copies the game, so later changes in play do not change the save', () => {
    const g = midGame();
    const saved = sanitizeSavedGame(g)!;
    g.match.us = 99;
    expect(saved.match.us).toBe(14);
  });

  it('a brand-new game is not worth continuing', () => {
    const fresh: SavedGame = { match: newGame(), clock: newClock(feel.clock), stats: newGameStats(), playIndex: 0 };
    expect(isFreshGame(fresh, feel.clock.quarterLength)).toBe(true);
    expect(isFreshGame(midGame(), feel.clock.quarterLength)).toBe(false);
    const oneSnap = { ...fresh, stats: { ...fresh.stats, us: { ...fresh.stats.us, plays: 1 } } };
    expect(isFreshGame(oneSnap, feel.clock.quarterLength)).toBe(false);
  });
});
