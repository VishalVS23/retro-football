import { describe, expect, it } from 'vitest';
import { feel } from '../config/feel';
import { createRng } from './rng';
import { simulateOppDrive, type OppDrive } from './oppDrive';
import { addPoints, newGameStats, recordEvent, recordOurPlay, recordTheirDrive, totalYards } from './gameStats';

describe('our plays', () => {
  it('passes: completions, yards, touchdowns, picks; incompletions only count the attempt', () => {
    let g = newGameStats();
    g = recordOurPlay(g, { kind: 'pass', result: 'complete', yards: 12, touchdown: false });
    g = recordOurPlay(g, { kind: 'pass', result: 'incomplete' });
    g = recordOurPlay(g, { kind: 'pass', result: 'complete', yards: 30, touchdown: true });
    g = recordOurPlay(g, { kind: 'pass', result: 'interception' });
    expect(g.qb).toEqual({ completions: 2, attempts: 4, yards: 42, touchdowns: 1, interceptions: 1 });
    expect(g.us).toMatchObject({ plays: 4, passYards: 42, rushYards: 0, turnovers: 1 });
    expect(g.longest).toBe(30);
  });

  it('runs add rushing yards; sacks come off passing yards but not the QB line', () => {
    let g = newGameStats();
    g = recordOurPlay(g, { kind: 'pass', result: 'complete', yards: 10, touchdown: false });
    g = recordOurPlay(g, { kind: 'run', yards: 7 });
    g = recordOurPlay(g, { kind: 'run', yards: -2 });
    g = recordOurPlay(g, { kind: 'sack', yards: -6 });
    expect(g.us).toMatchObject({ plays: 4, passYards: 4, rushYards: 5, sacked: 1 });
    expect(g.qb.yards).toBe(10);
    expect(totalYards(g.us)).toBe(9);
    expect(g.longest).toBe(10);
  });

  it('first downs and fumbles come from the drive rules', () => {
    let g = newGameStats();
    g = recordEvent(g, 'firstDown');
    g = recordEvent(g, 'firstDown');
    g = recordEvent(g, 'fumbleLost');
    g = recordEvent(g, 'touchdown');
    g = recordEvent(g, null);
    g = recordEvent(g, 'takeaway');
    expect(g.us).toMatchObject({ firstDowns: 2, turnovers: 1 });
    expect(g.them.turnovers).toBe(1);
  });
});

describe('their drives', () => {
  it('adds their yards, first downs, sacks and turnovers; punts and kicks are not snaps', () => {
    const d = (result: OppDrive['result'], plays: number): OppDrive => ({
      result,
      plays,
      yards: 0,
      seconds: 30,
      startX: 85,
      endX: 60,
      ourStartX: 35,
      points: 0,
      extraPointGood: null,
      bigPlay: null,
      note: null,
      stats: { passYards: 20, rushYards: 5, firstDowns: 2, sacks: 1 },
      timeoutsUsed: { offense: 0, defense: 0 },
    });
    let g = newGameStats();
    g = recordTheirDrive(g, d('punt', 6));
    g = recordTheirDrive(g, d('interception', 4));
    expect(g.them).toEqual({ plays: 9, passYards: 40, rushYards: 10, firstDowns: 4, turnovers: 1, sacked: 2 });
  });

  it('the drive sim adds up: passing + rushing never beats the yards it actually moved by much', () => {
    const rng = createRng(5);
    for (let i = 0; i < 300; i++) {
      const drive = simulateOppDrive(85, { quarter: 1, timeLeft: 120, quarterLength: 120, us: 0, them: 0 }, feel.oppDrive, rng);
      const sum = drive.stats.passYards + drive.stats.rushYards;
      if (drive.result === 'punt' || drive.result === 'downs' || drive.result === 'touchdown') expect(Math.abs(sum - drive.yards)).toBeLessThanOrEqual(drive.plays);
      expect(drive.stats.firstDowns).toBeLessThanOrEqual(drive.plays);
    }
  });
});

describe('score by quarter', () => {
  it('adds points to the right quarter and grows for overtime', () => {
    let g = newGameStats();
    g = addPoints(g, 1, 7, 0);
    g = addPoints(g, 4, 0, 3);
    g = addPoints(g, 4, 3, 0);
    g = addPoints(g, 5, 0, 6);
    expect(g.byQuarter.us).toEqual([7, 0, 0, 3, 0]);
    expect(g.byQuarter.them).toEqual([0, 0, 0, 3, 6]);
  });
});
