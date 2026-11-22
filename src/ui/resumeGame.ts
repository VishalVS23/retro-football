/**
 * "Continue game?" panel (Stage 2 step 8): shown on launch when a game was left unfinished.
 * CONTINUE (or Enter) picks it up at the play calling screen; NEW GAME throws it away.
 */
import '@fontsource/press-start-2p/latin-400.css';
import './resumeGame.css';

export interface ResumeOptions {
  /** e.g. "YOU 14 - 10 CPU" */
  score: string;
  /** e.g. "Q3 1:12 · 2nd & 6 · OWN 40" */
  situation: string;
  onContinue: () => void;
  onNewGame: () => void;
}

let close: (() => void) | null = null;

export function closeResumeGame() {
  close?.();
}

export function openResumeGame(o: ResumeOptions) {
  closeResumeGame();
  const el = document.createElement('div');
  el.id = 'resume-game';
  el.innerHTML = `
    <div class="rg-panel" role="dialog" aria-label="Continue your game">
      <div class="rg-head">GAME IN PROGRESS</div>
      <div class="rg-score"></div>
      <div class="rg-sit"></div>
      <div class="rg-buttons">
        <button class="rg-btn rg-new" type="button">NEW GAME</button>
        <button class="rg-btn rg-go" type="button">CONTINUE &gt;</button>
      </div>
    </div>`;
  el.querySelector('.rg-score')!.textContent = o.score;
  el.querySelector('.rg-sit')!.textContent = o.situation;
  const done = (fn: () => void) => {
    closeResumeGame();
    fn();
  };
  // Taps on the panel never reach the field or the play calling screen underneath.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.querySelector('.rg-go')!.addEventListener('click', () => done(o.onContinue));
  el.querySelector('.rg-new')!.addEventListener('click', () => done(o.onNewGame));

  // Enter = continue. While the panel is up, no key reaches the game (the play calling screen
  // also uses Enter/Esc). Capture phase, so this runs before the game's own key listeners.
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return; // ⚙ panel
    e.stopImmediatePropagation();
    if (e.type === 'keydown' && e.key === 'Enter') {
      e.preventDefault();
      done(o.onContinue);
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
