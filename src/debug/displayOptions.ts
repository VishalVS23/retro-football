/**
 * "Display" section in the ⚙ panel: switch the matchup arrows and the players' names on or off.
 * Per-device preferences (kept in this browser's localStorage, not in the save). The game scene
 * listens for DISPLAY_CHANGE_EVENT and redraws.
 */
export const DISPLAY_CHANGE_EVENT = 'rf-display-change';

export interface DisplayPrefs {
  /** Matchup markers on the play-call diagram (receivers and linemen). */
  arrows: boolean;
  /** Players' names on the field before the snap and on the play-call diagram. */
  names: boolean;
}

const KEY = 'rf-display';
const DEFAULTS: DisplayPrefs = { arrows: true, names: true };

export function getDisplayPrefs(): DisplayPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      arrows: typeof raw.arrows === 'boolean' ? raw.arrows : DEFAULTS.arrows,
      names: typeof raw.names === 'boolean' ? raw.names : DEFAULTS.names,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function setDisplayPref(key: keyof DisplayPrefs, value: boolean) {
  const next = { ...displayPrefs(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private window): the switch still works until the page reloads.
    memory = next;
  }
  window.dispatchEvent(new Event(DISPLAY_CHANGE_EVENT));
}

let memory: DisplayPrefs | null = null;

/** Current preferences (falls back to the in-memory copy when storage is blocked). */
export function displayPrefs(): DisplayPrefs {
  return memory ?? getDisplayPrefs();
}

export function addDisplayControls(panel: HTMLElement) {
  const p = displayPrefs();
  const section = document.createElement('div');
  section.className = 'fp-save';
  section.innerHTML = `
    <h3>Display</h3>
    <label class="fp-check"><input type="checkbox" data-pref="arrows" ${p.arrows ? 'checked' : ''}> Matchup arrows</label>
    <label class="fp-check"><input type="checkbox" data-pref="names" ${p.names ? 'checked' : ''}> Player names</label>`;
  section.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.pref as keyof DisplayPrefs | undefined;
    if (key) setDisplayPref(key, input.checked);
  });
  panel.querySelector('.fp-buttons')!.after(section);
}
