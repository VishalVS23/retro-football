/**
 * "Force defense" in the ⚙ panel (zone calls step Z-a): a testing switch that makes their coach
 * call the same defense every snap (auto = his normal pick). Per-device, kept in this browser's
 * localStorage (never in the save). The scene reads `forcedDefCall()` when it rolls the call.
 */
import type { DefCallId } from '../sim/defCalls';

const KEY = 'rf-force-defense';
const OPTIONS: { id: DefCallId | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Auto (their coach)' },
  { id: 'man', label: 'Man' },
  { id: 'press', label: 'Press man' },
  { id: 'off', label: 'Off man' },
  { id: 'blitz', label: 'LB blitz' },
  { id: 'cover3', label: 'Cover 3' },
];

let memory: string | null = null;

/** The call to force every snap, or null for their coach's normal pick. */
export function forcedDefCall(): DefCallId | null {
  let raw: string | null = memory;
  try {
    raw = localStorage.getItem(KEY) ?? memory;
  } catch {
    // Storage blocked: use the in-memory choice.
  }
  const hit = OPTIONS.find((o) => o.id === raw && o.id !== 'auto');
  return hit ? (hit.id as DefCallId) : null;
}

export function addForceDefenseControl(panel: HTMLElement) {
  const now = forcedDefCall() ?? 'auto';
  const section = document.createElement('div');
  section.className = 'fp-save';
  section.innerHTML = `
    <h3>Force defense (testing)</h3>
    <select data-force-defense>
      ${OPTIONS.map((o) => `<option value="${o.id}" ${o.id === now ? 'selected' : ''}>${o.label}</option>`).join('')}
    </select>
    <p style="margin:4px 0 0;opacity:.7">Applies from the next play.</p>`;
  section.querySelector('select')!.addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value;
    memory = value;
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Private window: kept in memory until the page reloads.
    }
  });
  panel.querySelector('.fp-buttons')!.after(section);
}
