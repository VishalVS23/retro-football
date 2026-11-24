/**
 * "Game" section in the ⚙ panel: NEW GAME (quit the game in progress), CHANGE TEAM and CHOOSE
 * OPPONENT (a new game against a team you pick, to test strong and weak opponents).
 * Testing tools until a proper in-game menu exists. The game scene listens for the events.
 */
export const NEW_GAME_EVENT = 'rf-new-game';
export const CHANGE_TEAM_EVENT = 'rf-change-team';
export const CHOOSE_OPPONENT_EVENT = 'rf-choose-opponent';
/** 4a: leave the game for the season screen. */
export const SEASON_SCREEN_EVENT = 'rf-season-screen';
/** Testing (A-a): their coach forgets what he's scouted this game. */
export const RESET_SCOUTING_EVENT = 'rf-reset-scouting';

export function addGameControls(panel: HTMLElement) {
  const section = document.createElement('div');
  section.className = 'fp-save';
  section.innerHTML = `
    <h3>Game</h3>
    <div class="fp-buttons">
      <button type="button" data-game="season">Season screen</button>
      <button type="button" data-game="new">New game</button>
      <button type="button" data-game="team">Change team</button>
      <button type="button" data-game="opponent">Choose opponent</button>
      <button type="button" data-game="forget">Reset scouting</button>
    </div>`;
  section.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-game]')?.dataset.game;
    if (!act) return;
    if (act === 'forget') {
      window.dispatchEvent(new Event(RESET_SCOUTING_EVENT));
      return;
    }
    if (act === 'opponent') {
      // The list has its own CANCEL; the game is only replaced once a team is picked.
      panel.classList.remove('open');
      window.dispatchEvent(new Event(CHOOSE_OPPONENT_EVENT));
      return;
    }
    const ask =
      act === 'new'
        ? 'Quit this game and start an exhibition game (it does not count in the season)? The current game is lost.'
        : act === 'season'
          ? 'Leave this game for the season screen? The current game is lost (a season game can be played again).'
          : 'Pick a different team? The current game is lost; the season goes on with your new team.';
    if (!window.confirm(ask)) return;
    panel.classList.remove('open'); // back to the game
    window.dispatchEvent(new Event(act === 'new' ? NEW_GAME_EVENT : act === 'season' ? SEASON_SCREEN_EVENT : CHANGE_TEAM_EVENT));
  });
  panel.querySelector('.fp-buttons')!.after(section);
}
