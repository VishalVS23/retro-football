/**
 * Our formation: where everyone lines up for a snap. Football layout, not feel.
 * Pure (no Phaser), shared by the field and the play-call diagrams.
 */
import { FIELD_WIDTH } from './field';
import type { Vec } from './throw';

/** Running back's spot: behind the QB, a step toward the bottom (his routes and runs go that way). */
export const RB_OFFSET = { x: -5.5, y: 1.5 };

/**
 * The lines (3h-a). Our five blockers, top to bottom: left tackle, left guard, centre, right guard,
 * right tackle. Their four rushers, top to bottom: top edge, top inside, bottom inside, bottom edge.
 * `BLOCKER_OF[i]` = which of our blockers takes rusher i; the centre has no man of his own and
 * helps on the toughest matchup of the snap.
 */
export const BLOCKER_OF = [0, 1, 3, 4] as const;
export const CENTRE = 2;
/** The slot receiver's index in `wrs` / `skill` (his name goes to his left: the line is right below him). */
export const SLOT = 1;
/** Tight end's spot: just outside the bottom tackle (3h-b). */
export const TE_Y = 6.5;
/**
 * Punts and interception returns were tuned with two blockers and two rushers: only these join
 * in (both guards; both inside rushers), the rest stay at the line.
 */
export const RETURN_LINE = [1, 3] as const;
export const RETURN_RUSH = [1, 2] as const;
/** Same for the skill spots: the three receivers and the RB join in, the tight end (3h-b) stays put (and so does LB2). */
export const RETURN_SKILL = 4;
/** QB's spot behind the line (was 2; the centre is at 1 now that there is one). */
export const QB_DEPTH = 2.8;
const BLOCK_Y = [-4, -2, 0, 2, 4];
const RUSH_Y = [-5.5, -2, 2, 5.5];

/**
 * Formations (F-a): where our skill players line up. Every play's routes run from these spots.
 * NORMAL: two receivers top (wide + slot), one wide bottom, the TE on the bottom of the line.
 * FLIP: the same mirrored top <-> bottom (and their rushers with it, so every matchup by index stays
 * the same: blocker i still takes rusher i, the TE still helps the edge rusher on his side).
 */
export type FormationId = 'normal' | 'flip';
export const FORMATION_IDS: readonly FormationId[] = ['normal', 'flip'];
export const FORMATION_NAMES: Record<FormationId, string> = { normal: 'NORMAL', flip: 'FLIP' };

/** The next formation in the FORMATION button's cycle. */
export function nextFormation(id: FormationId): FormationId {
  return FORMATION_IDS[(FORMATION_IDS.indexOf(id) + 1) % FORMATION_IDS.length];
}

/** Which side the defense reads from a formation: where the TE is and where the extra receivers are (-1 top, +1 bottom). */
export interface FormationSides {
  teSide: 1 | -1;
  strongSide: 1 | -1;
}
export const NORMAL_SIDES: FormationSides = { teSide: 1, strongSide: -1 };

export function formationSides(id: FormationId = 'normal'): FormationSides {
  return id === 'flip' ? { teSide: -1, strongSide: 1 } : NORMAL_SIDES;
}

/**
 * Where everyone lines up for a snap at losX: QB under centre, three receivers (two up top,
 * one at the bottom), a running back behind the QB, five blockers vs four rushers.
 * `towardMiddle` = which way is "inside" (+1 = larger y). `skill` = the three receivers, the
 * running back and the tight end, in the same order as a play's routes.
 */
export function formation(losX: number, id: FormationId = 'normal') {
  const mid = FIELD_WIDTH / 2;
  const flip = id === 'flip';
  const m = (y: number) => (flip ? mid - y : mid + y); // y offset from the middle -> field y
  const t = (d: 1 | -1): 1 | -1 => (flip ? (-d as 1 | -1) : d);
  const rush: Vec[] = RUSH_Y.map((y) => ({ x: losX + 1, y: m(y) }));
  const wrs: { pos: Vec; towardMiddle: 1 | -1 }[] = [
    { pos: { x: losX - 0.5, y: m(-13) }, towardMiddle: t(1) }, // wide, top
    { pos: { x: losX - 1, y: m(-7.5) }, towardMiddle: t(1) }, // slot, top (a yard wider since 3h-b: off the tackle)
    { pos: { x: losX - 0.5, y: m(13) }, towardMiddle: t(-1) }, // wide, bottom
  ];
  // The RB counts as "below the middle", so negative route y (toward his sideline) = the bottom side.
  const rb: { pos: Vec; towardMiddle: 1 | -1 } = { pos: { x: losX + RB_OFFSET.x, y: m(RB_OFFSET.y) }, towardMiddle: t(-1) };
  // Tight end on the bottom side, on the line: his routes' negative y = toward the bottom sideline, like the RB's.
  const te: { pos: Vec; towardMiddle: 1 | -1 } = { pos: { x: losX - 1, y: m(TE_Y) }, towardMiddle: t(-1) };
  return {
    // A step behind the centre so the two don't overlap (3h-a); his dropback is shorter to match,
    // so he still sets up 5 yards behind the line.
    qb: { x: losX - QB_DEPTH, y: mid },
    wrs,
    rb,
    te,
    skill: [...wrs, rb, te],
    rush,
    block: BLOCK_Y.map((y) => ({ x: losX - 1, y: m(y) })),
    sides: formationSides(id),
  };
}

