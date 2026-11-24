/**
 * Draws a play as an SVG string: field, line of scrimmage, first-down line, our formation,
 * routes (thick yellow, dark outline, chunky arrowhead, like on the field) and, for the big
 * diagram, the defense and labels. Coordinates are field yards (same as the sim).
 */
import { feel } from '../config/feel';
import { END_ZONE_DEPTH, FIELD_WIDTH, TOTAL_LENGTH, yardLineNumber } from '../sim/field';
import { formation, SLOT } from '../sim/formation';
import { OPP_GOAL_X } from '../sim/drive';
import { POST_HALF_WIDTH } from '../sim/kicking';
import { RB, TE, routePath, type PlayDef } from '../sim/routes';
import type { Vec } from '../sim/throw';
import { cornerStart, linebacker2Start, linebackerStart, safetyStart, type DefCallId, type ShellId } from '../sim/defCalls';

export interface DiagramView {
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Big diagram: defense, player labels, route names, yard numbers. Mini: just routes. */
  detailed: boolean;
  /** Receivers whose route was changed (hot route): drawn in the hot colour. */
  hot?: boolean[];
  /** Audible mode: ring each receiver (and the RB on a pass play) and make him tappable (`data-wr` = his index). */
  tappable?: boolean;
  /** Big diagram: our players' last names instead of WR / RB / QB (skill in formation order). */
  names?: { qb: string; skill: string[] };
  /**
   * Big diagram: the defenders' last names (cover[i] covers skill spot i: three corners and the
   * linebacker; plus the safety) and the matchup edge for each of our skill players
   * (+1 = ours, shown as a green up-arrow; -1 = theirs, a red down-arrow; 0 = even, a grey dash).
   */
  defense?: DiagramDefense;
  /** Big diagram: line the defense up for this call (3d2; shown once you're at the line). Default: normal man. */
  call?: DefCallId;
  /** Their safety look (3h-c), shown at the line like the call. */
  shell?: ShellId;
  /** A-c: S2 bracketing a receiver stands here instead of where the look puts him. */
  safety2At?: { x: number; y: number };
}

/**
 * Their defenders' names and the matchup edges (+1 ours, -1 theirs, 0 even): `edge` per skill
 * player; `line` per blocker (3e-b), separately for pass and run plays (different ratings).
 */
export interface DiagramDefense {
  cover: string[];
  safety: string;
  /** S2 (3h-c). */
  safety2?: string;
  edge: number[];
  line?: { pass: number[]; run: number[] };
  /** false = no matchup markers (the ⚙ Display switch). Default true. */
  arrows?: boolean;
}

/** Text from outside goes through this before landing in the SVG. */
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const C = {
  turf: '#2f6b4f',
  turfAlt: '#2a6247',
  endZone: '#1f4d63',
  line: '#f4efe1',
  los: '#7ec8e3',
  firstDown: '#ffd23f',
  route: '#ffd166',
  hot: '#ff7ad9',
  outline: '#0d1b2a',
  outOfBounds: '#14202b',
  goalPost: '#ffd23f',
  offense: '#e76f51',
  defense: '#3a6ea5',
  edgeUs: '#3ddc84',
  edgeThem: '#ff5c5c',
  edgeEven: '#a9b4c2',
};
const FONT = `'Press Start 2P', monospace`;
const n = (v: number) => Math.round(v * 100) / 100;

/** Route line + arrowhead, and (detailed) its name label separately so labels can go on top. */
function routeSvg(fullPath: Vec[], name: string, detailed: boolean, color = C.route, stop = false): { line: string; label: string } {
  // Stop routes (Hitch, Curl, Check): drawn up to the turn, ending in a flat "stop" bar
  // (the short step back toward the QB is too small to draw).
  const path = stop && fullPath.length >= 3 ? fullPath.slice(0, -1) : fullPath;
  if (path.length < 2) return { line: '', label: '' };
  const end = path[path.length - 1];
  const prev = path[path.length - 2];
  const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
  // Stop routes end in a short comeback, so they get a smaller arrowhead.
  // Never longer than the last leg, or the line would poke out backwards past it.
  const head = Math.min((detailed ? 2 : 2.6) * (stop ? 0.6 : 1), Math.hypot(end.x - prev.x, end.y - prev.y) * 0.9);
  const lineEnd = { x: end.x - Math.cos(ang) * head * 0.6, y: end.y - Math.sin(ang) * head * 0.6 };
  // Stop routes (Hitch, Curl, Check) end in a flat bar: "stop here and wait" (playbook style).
  const pts = (stop ? path : [...path.slice(0, -1), lineEnd]).map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
  const tri = (len: number, half: number, back: number) => {
    const bx = end.x - Math.cos(ang) * back;
    const by = end.y - Math.sin(ang) * back;
    const nx = -Math.sin(ang) * half;
    const ny = Math.cos(ang) * half;
    return [bx + Math.cos(ang) * len, by + Math.sin(ang) * len, bx + nx, by + ny, bx - nx, by - ny].map(n).join(',');
  };
  const w = detailed ? 1 : 1.4;
  const line = (stroke: string, width: number) =>
    `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
  let s = '';
  if (stop) {
    const bx = -Math.sin(ang) * 1.1 * w;
    const by = Math.cos(ang) * 1.1 * w;
    const bar = (k: number) => `x1="${n(end.x - bx * k)}" y1="${n(end.y - by * k)}" x2="${n(end.x + bx * k)}" y2="${n(end.y + by * k)}"`;
    s += line(C.outline, 0.85 * w);
    s += `<line ${bar(1.15)} stroke="${C.outline}" stroke-width="${1.05 * w}"/>`;
    s += line(color, 0.45 * w);
    s += `<line ${bar(1)} stroke="${color}" stroke-width="${0.6 * w}"/>`;
  } else {
    s += line(C.outline, 0.85 * w);
    s += `<polygon points="${tri(head + 0.5, 1.35 * (w > 1 ? 1.2 : 1), head * 0.8)}" fill="${C.outline}"/>`;
    s += line(color, 0.45 * w);
    s += `<polygon points="${tri(head, 0.95 * (w > 1 ? 1.2 : 1), head * 0.6)}" fill="${color}"/>`;
  }
  let label = '';
  if (detailed && stop) {
    // Stop route: name just downfield of the turn, clear of the receiver and his cornerback.
    const turn = path[path.length - 1];
    label = `<text x="${n(turn.x + 1.2)}" y="${n(turn.y + 0.55)}" font-size="1.5" text-anchor="start" fill="${color}" stroke="${C.outline}" stroke-width="0.45" paint-order="stroke" font-family="${FONT}">${name.toUpperCase()}</text>`;
  } else if (detailed) {
    // Route name just past the arrow tip, nudged away from the line's direction.
    const lx = end.x + Math.cos(ang) * 1.5;
    const ly = end.y + Math.sin(ang) * 1.5 + (Math.abs(Math.sin(ang)) > 0.7 ? 0 : -1.4);
    label = `<text x="${n(lx)}" y="${n(ly)}" font-size="1.5" text-anchor="middle" fill="${color}" stroke="${C.outline}" stroke-width="0.45" paint-order="stroke" font-family="${FONT}">${name.toUpperCase()}</text>`;
  }
  return { line: s, label };
}

/** A small matchup marker left of a player: up arrow (green) = our edge, down (red) = theirs, grey dash = even. */
function edgeArrow(p: Vec, edge: number): string {
  const x = p.x - 2.1;
  const y = p.y;
  if (!edge) return `<rect x="${n(x - 0.7)}" y="${n(y - 0.25)}" width="1.4" height="0.5" fill="${C.edgeEven}" stroke="${C.outline}" stroke-width="0.2"/>`;
  const pts = edge > 0 ? `${n(x - 0.8)},${n(y + 0.6)} ${n(x + 0.8)},${n(y + 0.6)} ${n(x)},${n(y - 0.8)}` : `${n(x - 0.8)},${n(y - 0.6)} ${n(x + 0.8)},${n(y - 0.6)} ${n(x)},${n(y + 0.8)}`;
  return `<polygon points="${pts}" fill="${edge > 0 ? C.edgeUs : C.edgeThem}" stroke="${C.outline}" stroke-width="0.25"/>`;
}

/**
 * A lineman's matchup (3h-a): a green ring = our blocker wins it, red = he loses it, nothing = even.
 * (Arrows like the receivers' don't fit: five blockers 2 yards apart, right in front of the QB.)
 */
function lineRing(p: Vec, edge: number): string {
  if (!edge) return '';
  return `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="1.2" fill="none" stroke="${edge > 0 ? C.edgeUs : C.edgeThem}" stroke-width="0.38"/>`;
}

/**
 * Where a player's label goes: under him, over him, or to his left (the slot and QB: the line is
 * right below them). 'leftFar' = left of his matchup marker too (the slot: markers sit at x - 2.1).
 */
type LabelSpot = 'below' | 'above' | 'left' | 'leftFar';

const LINEMAN_R = 0.8;

function player(p: Vec, color: string, label: string | null, spot: LabelSpot = 'below', r = 0.95): string {
  let s = `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${r}" fill="${color}" stroke="${C.line}" stroke-width="0.22"/>`;
  if (label) {
    const left = spot === 'left' || spot === 'leftFar';
    const x = spot === 'leftFar' ? p.x - 3.3 : left ? p.x - r - 0.4 : p.x;
    const y = left ? p.y + 0.4 : spot === 'above' ? p.y - 1.5 : p.y + 2.5;
    s += `<text x="${n(x)}" y="${n(y)}" font-size="1.05" text-anchor="${left ? 'end' : 'middle'}" fill="${C.line}" stroke="${C.outline}" stroke-width="0.35" paint-order="stroke" font-family="${FONT}">${label}</text>`;
  }
  return s;
}

export function playDiagramSvg(play: PlayDef, losX: number, firstDownX: number, v: DiagramView): string {
  const f = formation(losX);
  const x1 = v.x0 + v.w;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(v.x0)} ${n(v.y0)} ${n(v.w)} ${n(v.h)}" preserveAspectRatio="xMidYMid meet">`;

  // Turf stripes every 5 yards, end zones.
  for (let x = Math.floor(v.x0 / 5) * 5; x < x1; x += 5) {
    const inEndZone = x < END_ZONE_DEPTH || x >= TOTAL_LENGTH - END_ZONE_DEPTH;
    const out = x >= TOTAL_LENGTH || x < 0; // past the back of an end zone
    const color = out ? C.outOfBounds : inEndZone ? C.endZone : (x / 5) % 2 === 0 ? C.turf : C.turfAlt;
    s += `<rect x="${x}" y="${n(v.y0)}" width="5.05" height="${n(v.h)}" fill="${color}"/>`;
  }
  if (v.detailed) {
    for (let x = Math.ceil(v.x0 / 5) * 5; x < x1; x += 5) {
      if (x < END_ZONE_DEPTH || x > TOTAL_LENGTH - END_ZONE_DEPTH) continue;
      const goal = x === END_ZONE_DEPTH || x === TOTAL_LENGTH - END_ZONE_DEPTH;
      s += `<line x1="${x}" y1="0" x2="${x}" y2="${n(FIELD_WIDTH)}" stroke="${C.line}" stroke-opacity="${goal ? 1 : 0.45}" stroke-width="${goal ? 0.35 : 0.18}"/>`;
      const num = yardLineNumber(x);
      if (num !== null) {
        for (const y of [FIELD_WIDTH * 0.12, FIELD_WIDTH * 0.92]) {
          s += `<text x="${x}" y="${n(y)}" font-size="2.6" text-anchor="middle" fill="${C.line}" fill-opacity="0.45" font-family="${FONT}">${num}</text>`;
        }
      }
    }
  }
  // Back lines of the end zones, with the goalposts on them.
  for (const x of [0, TOTAL_LENGTH]) {
    if (x < v.x0 || x > x1) continue;
    s += `<line x1="${x}" y1="0" x2="${x}" y2="${n(FIELD_WIDTH)}" stroke="${C.line}" stroke-width="${v.detailed ? 0.35 : 0.5}"/>`;
    s += `<line x1="${x}" y1="${n(FIELD_WIDTH / 2 - POST_HALF_WIDTH)}" x2="${x}" y2="${n(FIELD_WIDTH / 2 + POST_HALF_WIDTH)}" stroke="${C.goalPost}" stroke-width="${v.detailed ? 0.6 : 0.9}"/>`;
  }
  // Line of scrimmage and first-down line.
  s += `<line x1="${losX}" y1="0" x2="${losX}" y2="${n(FIELD_WIDTH)}" stroke="${C.los}" stroke-width="${v.detailed ? 0.3 : 0.5}"/>`;
  if (v.detailed && firstDownX < OPP_GOAL_X) {
    s += `<line x1="${firstDownX}" y1="0" x2="${firstDownX}" y2="${n(FIELD_WIDTH)}" stroke="${C.firstDown}" stroke-width="0.35"/>`;
  }

  // Routes under the players; route names on top of everything.
  let labels = '';
  f.skill.forEach((wr, i) => {
    const route = play.routes[i];
    if (!route) return;
    const color = v.hot?.[i] ? C.hot : C.route;
    const r = routeSvg(routePath(wr.pos, route, wr.towardMiddle), route.name, v.detailed, color, route.stop);
    s += r.line;
    labels += r.label;
  });

  if (v.detailed) {
    // Defense where it lines up (same spots as on the field).
    // With names, the corners' go ABOVE them (our receivers' names are below ours, right next to
    // them); the linebacker's and safety's stay below (above them sit the line and route labels).
    const dn = v.defense;
    const dl = (name: string | undefined, fallback: string) => (name ? esc(name.toUpperCase()) : fallback);
    const call = v.call ?? 'man';
    f.wrs.forEach((wr, i) => (s += player(cornerStart(call, feel, wr.pos), C.defense, dl(dn?.cover[i], 'CB'), dn ? 'above' : 'below')));
    s += player(linebackerStart(call, feel, losX), C.defense, dl(dn?.cover[RB], 'LB'));
    s += player(linebacker2Start(feel, losX), C.defense, dl(dn?.cover[TE], 'LB')); // LB2 over the TE (3h-b)
    // Safeties (3h-c) where this snap's look puts them (two deep in the huddle: the look shows at the line).
    const shell = v.shell ?? 'twoDeep';
    s += player(safetyStart(feel, losX, shell, 0), C.defense, dl(dn?.safety, 'S'));
    // The robber sits right behind the linebackers: his name goes above him so the names don't run together.
    s += player(v.safety2At ?? safetyStart(feel, losX, shell, 1), C.defense, dl(dn?.safety2, 'S'), shell === 'robber' && !v.safety2At ? 'above' : 'below');
    f.rush.forEach((r) => (s += player(r, C.defense, null, 'below', LINEMAN_R))); // linemen unlabelled: too tightly packed
  }
  f.block.forEach((b) => (s += player(b, C.offense, null, 'below', LINEMAN_R)));
  const nm = v.names;
  f.wrs.forEach((wr, i) => (s += player(wr.pos, C.offense, v.detailed ? (nm ? esc(nm.skill[i].toUpperCase()) : 'WR') : null, i === SLOT ? 'leftFar' : 'below')));
  s += player(f.rb.pos, C.offense, v.detailed ? (nm ? esc(nm.skill[RB].toUpperCase()) : 'RB') : null);
  s += player(f.te.pos, C.offense, v.detailed ? (nm?.skill[TE] ? esc(nm.skill[TE].toUpperCase()) : 'TE') : null);
  s += player(f.qb, C.offense, v.detailed ? 'QB' : null, 'left'); // the backfield is too crowded for his name
  const arrows = v.detailed && v.defense && v.defense.arrows !== false;
  if (arrows) f.skill.forEach((sk, i) => (s += edgeArrow(sk.pos, v.defense!.edge[i] ?? 0)));
  const lineEdges = v.defense?.line?.[play.run ? 'run' : 'pass'];
  if (arrows && lineEdges) f.block.forEach((b, i) => (s += lineRing(b, lineEdges[i] ?? 0)));
  s += labels;
  if (v.tappable) {
    // Audible mode: a pulsing ring on each receiver, plus a big invisible tap target on top
    // (thumb-sized on a phone).
    f.skill.forEach((wr, i) => {
      if (i === RB && play.run) return; // a run play's RB path can't be changed
      s += `<circle class="pc-tap-ring" cx="${n(wr.pos.x)}" cy="${n(wr.pos.y)}" r="2" fill="none" stroke="${C.hot}" stroke-width="0.35"/>`;
      s += `<circle data-wr="${i}" cx="${n(wr.pos.x)}" cy="${n(wr.pos.y)}" r="3.5" fill="transparent" style="cursor:pointer"/>`;
    });
  }
  return s + '</svg>';
}
