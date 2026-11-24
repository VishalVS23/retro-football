import { describe, expect, it } from 'vitest';
import { FORMATION_IDS } from '../sim/formation';
import { PLAYS } from '../sim/routes';
import type { DefCallId, ShellId } from '../sim/defCalls';
import { playDiagramSvg } from './playDiagram';

/** Every <text> in the SVG as a box (Press Start 2P: each glyph is 1 em wide). */
function textBoxes(svg: string) {
  const out: { text: string; x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const m of svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)" text-anchor="(\w+)"[^>]*>([^<]*)<\/text>/g)) {
    const [x, y, size] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (size > 2) continue; // yard numbers, painted on the turf
    const w = m[5].length * size;
    const x0 = m[4] === 'end' ? x - w : m[4] === 'middle' ? x - w / 2 : x;
    out.push({ text: m[5], x0, x1: x0 + w, y0: y - size, y1: y });
  }
  return out;
}

describe('play diagram labels (F-c1)', () => {
  it('no two names or route names overlap, in any formation, play or look (long names, markers on)', () => {
    const looks: [DefCallId, ShellId][] = [['man', 'twoDeep'], ['man', 'robber'], ['press', 'twoDeep'], ['cover3', 'robber'], ['cover2', 'twoDeep']];
    // Real last names are mostly 5-7 letters; a few long ones to make it hard.
    const ours = ['MARSHALL', 'GAINES', 'HARTLEY', 'WHITFIELD', 'VANCE'];
    const theirs = ['HOLLOWAY', 'STANTON', 'FLETCHER', 'HAYES', 'MERCER'];
    const bad: string[] = [];
    let named = 0, shown = 0;
    for (const formation of FORMATION_IDS)
      for (const play of PLAYS)
        for (const [call, shell] of looks) {
          const svg = playDiagramSvg(play, 40, 50, {
            x0: 26,
            y0: 4.5,
            w: 77,
            h: 45,
            detailed: true,
            formation,
            call,
            shell,
            names: { qb: 'QB', skill: ours },
            defense: { cover: theirs, safety: 'KOWALSKI', safety2: 'LANE', edge: [1, -1, 0, 1, -1] },
          });
          const boxes = textBoxes(svg);
          const texts = boxes.map((b) => b.text);
          // Our names must always show in full; count how many of theirs do.
          for (const nme of ours) expect(texts, `${formation} ${play.name} ${call}/${shell}`).toContain(nme);
          for (const nme of [...theirs, 'KOWALSKI', 'LANE']) {
            named++;
            if (texts.includes(nme)) shown++;
          }
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i], b = boxes[j];
              if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) bad.push(`${formation} ${play.name} ${call}/${shell}: ${a.text} x ${b.text}`);
            }
        }
    expect(bad).toEqual([]);
    // Most defenders keep their full name (the rest show CB / LB / S, or nothing when even that won't fit).
    expect(shown / named, `${shown}/${named}`).toBeGreaterThan(0.8);
  });
});
