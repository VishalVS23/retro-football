/**
 * Our formation: where everyone lines up for a snap. Football layout, not feel.
 * Pure (no Phaser), shared by the field and the play-call diagrams.
 */
import { FIELD_WIDTH } from './field';
import type { Vec } from './throw';

/** Running back's spot: behind the QB, a step toward the bottom (his routes and runs go that way). */
export const RB_OFFSET = { x: -5.5, y: 1.5 };

/**
 * Where everyone lines up for a snap at losX: QB under centre, three receivers (two up top,
 * one at the bottom), a running back behind the QB, two rushers with a blocker each.
 * `towardMiddle` = which way is "inside" (+1 = larger y). `skill` = the three receivers plus the
 * running back, in the same order as a play's routes.
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
  // The RB counts as "below the middle", so negative route y (toward his sideline) = the bottom side.
  const rb: { pos: Vec; towardMiddle: 1 | -1 } = { pos: { x: losX + RB_OFFSET.x, y: mid + RB_OFFSET.y }, towardMiddle: -1 };
  return {
    qb: { x: losX - 2, y: mid },
    wrs,
    rb,
    skill: [...wrs, rb],
    rush,
    block: rush.map((r) => ({ x: losX - 1, y: r.y })),
  };
}

