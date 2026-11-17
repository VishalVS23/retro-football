/**
 * Draws a play as an SVG string: field, line of scrimmage, first-down line, our formation,
 * routes (thick yellow, dark outline, chunky arrowhead, like on the field) and, for the big
 * diagram, the defense and labels. Coordinates are field yards (same as the sim).
 */
import { feel } from '../config/feel';
import { END_ZONE_DEPTH, FIELD_WIDTH, TOTAL_LENGTH, yardLineNumber } from '../sim/field';
import { formation } from '../sim/formation';
import { OPP_GOAL_X } from '../sim/drive';
import { RB, routePath, type PlayDef } from '../sim/routes';
import type { Vec } from '../sim/throw';

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
}

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
  offense: '#e76f51',
  defense: '#3a6ea5',
};
const FONT = `'Press Start 2P', monospace`;
const n = (v: number) => Math.round(v * 100) / 100;

/** Route line + arrowhead, and (detailed) its name label separately so labels can go on top. */
function routeSvg(path: Vec[], name: string, detailed: boolean, color = C.route, stop = false): { line: string; label: string } {
  if (path.length < 2) return { line: '', label: '' };
  const end = path[path.length - 1];
  const prev = path[path.length - 2];
  const ang = Math.atan2(end.y - prev.y, end.x - prev.x);
  // Stop routes end in a short comeback, so they get a smaller arrowhead.
  const head = (detailed ? 2 : 2.6) * (stop ? 0.6 : 1);
  const lineEnd = { x: end.x - Math.cos(ang) * head * 0.6, y: end.y - Math.sin(ang) * head * 0.6 };
  const pts = [...path.slice(0, -1), lineEnd].map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
  const tri = (len: number, half: number, back: number) => {
    const bx = end.x - Math.cos(ang) * back;
    const by = end.y - Math.sin(ang) * back;
    const nx = -Math.sin(ang) * half;
    const ny = Math.cos(ang) * half;
    return [bx + Math.cos(ang) * len, by + Math.sin(ang) * len, bx + nx, by + ny, bx - nx, by - ny].map(n).join(',');
  };
  const w = detailed ? 1 : 1.4;
  let s = '';
  s += `<polyline points="${pts}" fill="none" stroke="${C.outline}" stroke-width="${0.85 * w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += `<polygon points="${tri(head + 0.5, 1.35 * (w > 1 ? 1.2 : 1), head * 0.8)}" fill="${C.outline}"/>`;
  s += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${0.45 * w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += `<polygon points="${tri(head, 0.95 * (w > 1 ? 1.2 : 1), head * 0.6)}" fill="${color}"/>`;
  let label = '';
  if (detailed && stop) {
    // Stop route: name just downfield of the turn, clear of the receiver and his cornerback.
    const turn = path[path.length - 2];
    label = `<text x="${n(turn.x + 1.2)}" y="${n(turn.y + 0.55)}" font-size="1.5" text-anchor="start" fill="${color}" stroke="${C.outline}" stroke-width="0.45" paint-order="stroke" font-family="${FONT}">${name.toUpperCase()}</text>`;
  } else if (detailed) {
    // Route name just past the arrow tip, nudged away from the line's direction.
    const lx = end.x + Math.cos(ang) * 1.5;
    const ly = end.y + Math.sin(ang) * 1.5 + (Math.abs(Math.sin(ang)) > 0.7 ? 0 : -1.4);
    label = `<text x="${n(lx)}" y="${n(ly)}" font-size="1.5" text-anchor="middle" fill="${color}" stroke="${C.outline}" stroke-width="0.45" paint-order="stroke" font-family="${FONT}">${name.toUpperCase()}</text>`;
  }
  return { line: s, label };
}

function player(p: Vec, color: string, label: string | null): string {
  let s = `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="0.95" fill="${color}" stroke="${C.line}" stroke-width="0.22"/>`;
  if (label) {
    s += `<text x="${n(p.x)}" y="${n(p.y + 2.5)}" font-size="1.05" text-anchor="middle" fill="${C.line}" stroke="${C.outline}" stroke-width="0.35" paint-order="stroke" font-family="${FONT}">${label}</text>`;
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
    const color = inEndZone ? C.endZone : (x / 5) % 2 === 0 ? C.turf : C.turfAlt;
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
    f.wrs.forEach((wr) => (s += player({ x: wr.pos.x + feel.defense.cbCushionYards, y: wr.pos.y }, C.defense, 'CB')));
    s += player({ x: losX + feel.defense.lbDepthYards, y: FIELD_WIDTH / 2 }, C.defense, 'LB');
    s += player({ x: Math.min(losX + feel.defense.safetyDepthYards, TOTAL_LENGTH - 1), y: FIELD_WIDTH / 2 }, C.defense, 'S');
    f.rush.forEach((r) => (s += player(r, C.defense, null))); // linemen unlabelled: too tightly packed
  }
  f.block.forEach((b) => (s += player(b, C.offense, null)));
  f.wrs.forEach((wr) => (s += player(wr.pos, C.offense, v.detailed ? 'WR' : null)));
  s += player(f.rb.pos, C.offense, v.detailed ? 'RB' : null);
  s += player(f.qb, C.offense, v.detailed ? 'QB' : null);
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
