/**
 * "Choose your team" (Stage 3b): the 32 teams by conference and division, with offense / defense
 * ratings and stars. Tap one, then PLAY AS ... (or Enter). Shown once, when the league is new.
 */
import '@fontsource/press-start-2p/latin-400.css';
import './chooseTeam.css';
import { teamLogoHtml } from './teamLogo';
import { starText } from '../league/teamStars';

export interface TeamChoice {
  id: number;
  city: string;
  nickname: string;
  abbr: string;
  color: string;
  conference: number;
  division: number;
  offense: number;
  defense: number;
  /** 1-5, by rank in the league. */
  stars: number;
}

export interface ChooseTeamOptions {
  teams: TeamChoice[];
  conferences: readonly string[];
  divisions: readonly (readonly string[])[];
  onPick: (teamId: number) => void;
  /** Choosing an opponent instead of your team: other title and button, your own team can't be picked, CANCEL / Esc closes. */
  opponent?: { ownTeamId: number; onCancel: () => void };
}

let close: (() => void) | null = null;

export function closeChooseTeam() {
  close?.();
}

export function openChooseTeam(o: ChooseTeamOptions) {
  closeChooseTeam();
  const el = document.createElement('div');
  el.id = 'choose-team';
  const conferences = o.conferences
    .map((conf, c) => {
      const divisions = o.divisions[c]
        .map((div, d) => {
          const rows = o.teams
            .filter((t) => t.conference === c && t.division === d)
            .map(
              (t) => `
              <button class="ct-team" type="button" data-id="${t.id}"${o.opponent?.ownTeamId === t.id ? ' disabled' : ''}>
                ${teamLogoHtml(t.abbr, t.color, 30)}
                <span class="ct-names"><span class="ct-abbr">${t.abbr}</span><span class="ct-nick">${t.nickname}</span></span>
                <span class="ct-stars" aria-label="${t.stars} of 5 stars">${starText(t.stars)}</span>
              </button>`,
            )
            .join('');
          return `<div class="ct-div"><div class="ct-div-name">${div.toUpperCase()}</div>${rows}</div>`;
        })
        .join('');
      return `<div class="ct-conf"><div class="ct-conf-name">${conf.toUpperCase()}</div><div class="ct-divs">${divisions}</div></div>`;
    })
    .join('');
  el.innerHTML = `
    <div class="ct-panel" role="dialog" aria-label="Choose your team">
      <div class="ct-head">
        <div class="ct-title">${o.opponent ? 'CHOOSE OPPONENT' : 'CHOOSE YOUR TEAM'}</div>
        <div class="ct-sub">${o.opponent ? 'Starts a new game against them. More stars = a stronger team.' : 'More stars = a stronger roster. A weak team is a challenge.'}</div>
      </div>
      <div class="ct-body">${conferences}</div>
      <div class="ct-foot">
        <div class="ct-picked">TAP A TEAM</div>
        ${o.opponent ? '<button class="ct-cancel" type="button">CANCEL</button>' : ''}
        <button class="ct-go" type="button" disabled>PLAY &gt;</button>
      </div>
    </div>`;

  let picked: TeamChoice | null = null;
  const picks = el.querySelectorAll<HTMLButtonElement>('.ct-team');
  const pickedEl = el.querySelector<HTMLDivElement>('.ct-picked')!;
  const go = el.querySelector<HTMLButtonElement>('.ct-go')!;
  picks.forEach((b) =>
    b.addEventListener('click', () => {
      picked = o.teams.find((t) => t.id === Number(b.dataset.id)) ?? null;
      picks.forEach((x) => x.classList.toggle('on', x === b));
      if (!picked) return;
      pickedEl.innerHTML = teamLogoHtml(picked.abbr, picked.color, 34);
      const text = document.createElement('span');
      text.className = 'ct-picked-text';
      const name = document.createElement('span');
      name.className = 'ct-picked-name';
      name.textContent = `${picked.city} ${picked.nickname}`.toUpperCase();
      const r = document.createElement('span');
      r.className = 'ct-picked-ratings';
      r.textContent = `OFF ${picked.offense.toFixed(1)} · DEF ${picked.defense.toFixed(1)}`;
      text.append(name, r);
      pickedEl.append(text);
      go.disabled = false;
      go.textContent = `${o.opponent ? 'PLAY VS' : 'PLAY AS'} ${picked.abbr} >`;
    }),
  );
  const confirm = () => {
    if (!picked) return;
    const id = picked.id;
    closeChooseTeam();
    o.onPick(id);
  };
  go.addEventListener('click', confirm);
  const cancel = () => {
    if (!o.opponent) return;
    closeChooseTeam();
    o.opponent.onCancel();
  };
  el.querySelector('.ct-cancel')?.addEventListener('click', cancel);
  // Taps never reach the field or the play calling screen underneath.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  // Enter = confirm. No key reaches the game while this is open (capture phase, runs first).
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return; // ⚙ panel
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && e.key === 'Enter') {
      e.preventDefault();
      confirm();
    }
    if (e.type === 'keydown' && e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  document.body.appendChild(el);
  close = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    el.remove();
    close = null;
  };
}
