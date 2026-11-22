/**
 * A team's logo for the HTML screens: its image if it has one (public/logos/<ABBR>.png),
 * otherwise a dot in its colour.
 */
import { TEAM_LOGOS } from '../league/teams';

export function teamLogoUrl(abbr: string): string | null {
  return TEAM_LOGOS.has(abbr) ? `${import.meta.env.BASE_URL}logos/${abbr}.png` : null;
}

/** HTML for a logo (or colour dot), `size` px square. abbr and color come from our own team list. */
export function teamLogoHtml(abbr: string, color: string, size: number): string {
  const url = teamLogoUrl(abbr);
  if (url) return `<img class="team-logo" src="${url}" alt="" width="${size}" height="${size}" draggable="false">`;
  const dot = Math.round(size * 0.6);
  return `<span class="team-dot-box" style="width:${size}px;height:${size}px"><span class="team-dot" style="width:${dot}px;height:${dot}px;background:${color}"></span></span>`;
}
