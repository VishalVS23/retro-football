/**
 * Personality label shown on a player's profile, worked out from his hidden attributes (plus a
 * couple of mental ones). The label is the only window the user gets onto most hidden numbers.
 * The first rule that matches wins, so the order matters.
 */
import type { Attributes, Hidden } from './attributes';

export type Personality =
  | 'Model Professional'
  | 'Professional'
  | 'Born Leader'
  | 'Volatile'
  | 'Mercenary'
  | 'Ambitious'
  | 'Loyal'
  | 'Unflappable'
  | 'Nervy'
  | 'Low Determination'
  | 'Easygoing'
  | 'Balanced';

export const PERSONALITY_TEXT: Record<Personality, string> = {
  'Model Professional': 'Lives for the game. Trains hard, stays out of trouble, sets the standard.',
  Professional: 'Takes his job seriously and rarely causes problems.',
  'Born Leader': 'Others follow him. His mood spreads through the locker room.',
  Volatile: 'Short fuse. Can boil over in games, in practice or in the press.',
  Mercenary: 'Goes where the money is. Don’t count on him staying.',
  Ambitious: 'Wants to win big and be a star. Gets restless on a losing team.',
  Loyal: 'Attached to his team. Hard to lure away, upset if traded.',
  Unflappable: 'Nothing rattles him. Plays the same in a blowout or a title game.',
  Nervy: 'Can tighten up when the pressure is on.',
  'Low Determination': 'Doesn’t push himself. Talent may go to waste.',
  Easygoing: 'Relaxed and content. Won’t rock the boat, won’t drive himself either.',
  Balanced: 'No strong traits either way.',
};

export function personality(h: Hidden, a: Pick<Attributes, 'leadership' | 'workRate' | 'composure'>): Personality {
  if (h.professionalism >= 17 && h.temperament >= 13 && a.workRate >= 13) return 'Model Professional';
  if (h.temperament <= 5) return 'Volatile';
  if (a.leadership >= 17 && h.professionalism >= 12) return 'Born Leader';
  if (h.ambition >= 15 && h.loyalty <= 6) return 'Mercenary';
  if (h.professionalism >= 15) return 'Professional';
  if (h.professionalism <= 6 && a.workRate <= 8) return 'Low Determination';
  if (h.ambition >= 16) return 'Ambitious';
  if (h.loyalty >= 16) return 'Loyal';
  if (h.pressure >= 16 && a.composure >= 12) return 'Unflappable';
  if (h.pressure <= 5) return 'Nervy';
  if (h.ambition <= 6) return 'Easygoing';
  return 'Balanced';
}
