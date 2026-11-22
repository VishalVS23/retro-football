/**
 * "Sample players" in the ⚙ panel (Stage 3a): generates a few random players so the player model
 * can be looked at before the roster and profile screens exist (3c). Debug only; changes nothing.
 * Uses its own fresh seed, so it never touches the save's dice.
 */
import { ATTRIBUTE_NAMES, POSITION_WEIGHTS, type AttributeKey } from '../players/attributes';
import { generatePlayer } from '../players/generate';
import { currentAbility, fullName, playerPersonality, ratingWords } from '../players/player';
import { POSITIONS } from '../players/positions';
import { TRAITS } from '../players/traits';
import { createRng, randomSeed } from '../sim/rng';

function describePlayers(): string {
  const rng = createRng(randomSeed());
  const lines: string[] = [];
  for (let i = 0; i < 4; i++) {
    const position = rng.pick(POSITIONS);
    const p = generatePlayer(rng, { id: i, position, quality: rng.range(6, 18), age: rng.int(21, 34) });
    const ca = currentAbility(p);
    // His position's attributes, most important first.
    const keys = (Object.entries(POSITION_WEIGHTS[position]) as [AttributeKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const attrs = keys.map(([k]) => `${ATTRIBUTE_NAMES[k]} ${p.attributes[k]}`).join(', ');
    const other = Object.entries(p.familiarity)
      .map(([pos, f]) => `${pos} (${f})`)
      .join(', ');
    lines.push(
      `${position} · ${fullName(p)} · age ${p.age}`,
      `  Rating ${ca.toFixed(1)} (${ratingWords(ca)}) · potential ${p.potential.toFixed(1)} (${ratingWords(p.potential)}, hidden)`,
      `  ${playerPersonality(p)}${p.traits.length ? ' · ' + p.traits.map((t) => TRAITS[t].label).join(', ') : ''}`,
      `  ${attrs}`,
      ...(other ? [`  Can also play: ${other}`] : []),
      '',
    );
  }
  return lines.join('\n');
}

export function addSamplePlayers(panel: HTMLElement) {
  const section = document.createElement('div');
  section.className = 'fp-save';
  section.innerHTML = `
    <h3>Players (stage 3a preview)</h3>
    <div class="fp-buttons"><button type="button">Sample players</button></div>
    <pre class="fp-players"></pre>`;
  const out = section.querySelector<HTMLPreElement>('.fp-players')!;
  section.querySelector('button')!.addEventListener('click', () => (out.textContent = describePlayers()));
  const save = panel.querySelector('.fp-save');
  (save ?? panel.querySelector('.fp-buttons')!).after(section);
}
