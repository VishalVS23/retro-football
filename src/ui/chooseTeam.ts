/**
 * "Choose your team" (Stage 3b): the 32 teams by conference and division, with offense / defense
 * ratings and stars. Tap one, then PLAY AS ... (or Enter). Shown once, when the league is new.
 */
import '@fontsource/press-start-2p/latin-400.css';
import './chooseTeam.css';

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
}

let close: (() => void) | null = null;

export function closeChooseTeam() {
  close?.();
}

const starText = (n: number) => '*'.repeat(n) + '-'.repeat(5 - n);

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
              <button class="ct-team" type="button" data-id="${t.id}">
                <span class="ct-chip" style="background:${t.color}"></span>
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
        <div class="ct-title">CHOOSE YOUR TEAM</div>
        <div class="ct-sub">More stars = a stronger roster. A weak team is a challenge.</div>
      </div>
      <div class="ct-body">${conferences}</div>
      <div class="ct-foot">
        <div class="ct-picked">TAP A TEAM</div>
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
      pickedEl.innerHTML = '';
      const name = document.createElement('span');
      name.className = 'ct-picked-name';
      name.textContent = `${picked.city} ${picked.nickname}`.toUpperCase();
      const r = document.createElement('span');
      r.className = 'ct-picked-ratings';
      r.textContent = `OFF ${picked.offense.toFixed(1)} · DEF ${picked.defense.toFixed(1)}`;
      pickedEl.append(name, r);
      go.disabled = false;
      go.textContent = `PLAY AS ${picked.abbr} >`;
    }),
  );
  const confirm = () => {
    if (!picked) return;
    const id = picked.id;
    closeChooseTeam();
    o.onPick(id);
  };
  go.addEventListener('click', confirm);
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
