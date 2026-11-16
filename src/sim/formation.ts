/**
 * Our formation: where everyone lines up for a snap. Football layout, not feel.
 * Pure (no Phaser), shared by the field and the play-call diagrams.
 */
import { FIELD_WIDTH } from './field';
import type { Vec } from './throw';

/**
 * Where everyone lines up for a snap at losX: QB under centre, three receivers (two up top,
 * one at the bottom), two rushers with a blocker each. `towardMiddle` = which way is "inside".
 */
export function formation(losX: number) {
  const mid = FIELD_WIDTH / 2;
  const rush: Vec[] = [
    { x: losX + 1, y: mid - 3 },
    { x: losX + 1, y: mid + 3 },
  ];
  const wrs: { pos: Vec; towardMiddle: 1 | -1 }[] = [
    { pos: { x: losX - 0.5, y: mid - 13 }, towardMiddle: 1 }, // wide, top
    { pos: { x: losX - 1, y: mid - 6.5 }, towardMiddle: 1 }, // slot, top
    { pos: { x: losX - 0.5, y: mid + 13 }, towardMiddle: -1 }, // wide, bottom
  ];
  return {
    qb: { x: losX - 2, y: mid },
    wrs,
    rush,
    block: rush.map((r) => ({ x: losX - 1, y: r.y })),
  };
}

