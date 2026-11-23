import { describe, expect, it } from 'vitest';
import { generateLeague, teamRatings } from './league';
import { starText, teamStars } from './teamStars';

describe('team stars', () => {
  const lg = generateLeague(4242);
  const s = teamStars(lg);

  it('every team gets 1-5 for overall, offense and defense; each star level is a fifth of the league', () => {
    expect(s).toHaveLength(lg.teams.length);
    for (const key of ['overall', 'offense', 'defense'] as const) {
      const counts = [1, 2, 3, 4, 5].map((n) => s.filter((x) => x[key] === n).length);
      for (const c of counts) expect(c).toBeGreaterThanOrEqual(6);
    }
  });

  it('the best offense has 5 offense stars, the worst defense 1 defense star', () => {
    const r = lg.teams.map((t) => teamRatings(lg, t.id));
    const bestOff = r.indexOf([...r].sort((a, b) => b.offense - a.offense)[0]);
    const worstDef = r.indexOf([...r].sort((a, b) => a.defense - b.defense)[0]);
    expect(s[bestOff].offense).toBe(5);
    expect(s[worstDef].defense).toBe(1);
  });

  it('star text for the pixel font', () => {
    expect(starText(3)).toBe('***--');
    expect(starText(9)).toBe('*****');
  });
});
