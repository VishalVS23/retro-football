/**
 * Name pools for generated players: common first names and surnames, combined at random.
 * Never real players' names on purpose; any match with a real person is a coincidence.
 */
import type { Rng } from '../sim/rng';

export const FIRST_NAMES: readonly string[] = [
  'Aaron', 'Adrian', 'Alec', 'Andre', 'Ari', 'Austin', 'Beau', 'Ben', 'Blake', 'Brady', 'Brandon', 'Brent',
  'Caleb', 'Calvin', 'Cam', 'Carter', 'Casey', 'Chase', 'Cody', 'Colby', 'Connor', 'Corey', 'Dallas', 'Damon',
  'Dante', 'Darius', 'Davon', 'Dean', 'Derek', 'Desmond', 'Devin', 'Dominic', 'Drew', 'Dylan', 'Eli', 'Elijah',
  'Emmett', 'Eric', 'Ethan', 'Evan', 'Felix', 'Garrett', 'Grant', 'Gus', 'Hank', 'Hayden', 'Hunter', 'Isaac',
  'Isaiah', 'Jace', 'Jalen', 'Jamal', 'Jared', 'Jarvis', 'Jasper', 'Javier', 'Jaylen', 'Jerome', 'Jesse', 'Joel',
  'Jonah', 'Jordan', 'Josiah', 'Julian', 'Kade', 'Keegan', 'Kendall', 'Kenny', 'Keon', 'Kyle', 'Lamar', 'Landon',
  'Lane', 'Leon', 'Levi', 'Logan', 'Lucas', 'Malcolm', 'Marcus', 'Mario', 'Mason', 'Micah', 'Miles', 'Nate',
  'Nico', 'Noah', 'Omar', 'Owen', 'Parker', 'Quentin', 'Quinn', 'Rafael', 'Reed', 'Reggie', 'Rhett', 'Rico',
  'Ryder', 'Sam', 'Seth', 'Shane', 'Silas', 'Spencer', 'Tanner', 'Terrell', 'Theo', 'Trent', 'Trey', 'Tristan',
  'Troy', 'Tyler', 'Vince', 'Wade', 'Wes', 'Xavier', 'Zach', 'Zeke',
];

export const LAST_NAMES: readonly string[] = [
  'Abbott', 'Alvarez', 'Archer', 'Atkins', 'Baker', 'Banks', 'Barlow', 'Bennett', 'Bishop', 'Blackwell', 'Boone', 'Bowers',
  'Bradford', 'Brooks', 'Burke', 'Caldwell', 'Carver', 'Castillo', 'Chandler', 'Clayton', 'Coleman', 'Conley', 'Crane', 'Crawford',
  'Dalton', 'Dawson', 'Delgado', 'Dixon', 'Dorsey', 'Drummond', 'Dunn', 'Easton', 'Ellison', 'Emerson', 'Farley', 'Fenwick',
  'Fischer', 'Fleming', 'Ford', 'Fowler', 'Gaines', 'Garner', 'Gibbs', 'Goodwin', 'Graves', 'Griffin', 'Hale', 'Harmon',
  'Hartley', 'Hayes', 'Hendricks', 'Holloway', 'Hopkins', 'Hudson', 'Ingram', 'Jennings', 'Kemp', 'Kendrick', 'Kimball', 'Knox',
  'Lambert', 'Langley', 'Lawson', 'Lockhart', 'Lowell', 'Maddox', 'Malone', 'Marsh', 'Mathis', 'McBride', 'Mercer', 'Monroe',
  'Morales', 'Nash', 'Navarro', 'Norris', 'Oakley', 'Ortega', 'Osborne', 'Pace', 'Palmer', 'Pearce', 'Pickett', 'Porter',
  'Quinlan', 'Ramsey', 'Reyes', 'Rhodes', 'Riggs', 'Rollins', 'Sampson', 'Sawyer', 'Sexton', 'Shepherd', 'Sinclair', 'Slater',
  'Stanton', 'Stokes', 'Sutton', 'Talbot', 'Tate', 'Thornton', 'Tillman', 'Townsend', 'Vance', 'Vaughn', 'Wallace', 'Walsh',
  'Webb', 'Whitaker', 'Whitfield', 'Wilder', 'Winslow', 'Wolfe', 'Yates', 'Yearwood',
];

export function randomName(rng: Rng): { firstName: string; lastName: string } {
  return { firstName: rng.pick(FIRST_NAMES), lastName: rng.pick(LAST_NAMES) };
}
