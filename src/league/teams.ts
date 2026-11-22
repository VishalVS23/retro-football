/**
 * The 32 teams of the league (Stage 3b): real cities, made-up nicknames, abbreviations, colours,
 * conferences and divisions. Pure data.
 *
 * Nicknames were checked against current and past NFL, NBA, MLB, NHL, MLS, WNBA, CFL, spring
 * leagues (USFL / XFL / UFL / AAF), PWHL / NWSL, old indoor soccer and major college teams: none is a real team's nickname.
 * Colours don't copy any real team from the same city.
 */
export interface TeamDef {
  city: string;
  nickname: string;
  /** Three letters, unique. */
  abbr: string;
  /** Main and second colour (#rrggbb). The second is used when the main one clashes. */
  colors: [string, string];
  /** 0 or 1, see CONFERENCES. */
  conference: number;
  /** 0-3 within the conference, see DIVISIONS. */
  division: number;
}

export const CONFERENCES = ['Keystone Conference', 'Frontier Conference'] as const;
export const DIVISIONS: readonly (readonly string[])[] = [
  ['North', 'East', 'South', 'Central'],
  ['North', 'South', 'Mountain', 'Pacific'],
];

const t = (city: string, nickname: string, abbr: string, colors: [string, string], conference: number, division: number): TeamDef => ({
  city,
  nickname,
  abbr,
  colors,
  conference,
  division,
});

export const TEAM_DEFS: readonly TeamDef[] = [
  // Keystone North
  t('Boston', 'Lanterns', 'BOS', ['#d98e04', '#1b2a41'], 0, 0),
  t('New York', 'Ferrymen', 'NYF', ['#c44536', '#f2e8cf'], 0, 0),
  t('Buffalo', 'Gales', 'BUF', ['#5fa8d3', '#22333b'], 0, 0),
  t('Pittsburgh', 'Ironclads', 'PIT', ['#8d99ae', '#2b2d42'], 0, 0),
  // Keystone East
  t('Philadelphia', 'Founders', 'PHI', ['#b23a2e', '#e9c46a'], 0, 1),
  t('Baltimore', 'Schooners', 'BAL', ['#00a6d6', '#fdfcdc'], 0, 1),
  t('Washington', 'Sentinels', 'WAS', ['#6a6fd1', '#f4a261'], 0, 1),
  t('Raleigh', 'Pines', 'RAL', ['#e9b949', '#1b4332'], 0, 1),
  // Keystone South
  t('Atlanta', 'Ironhorses', 'ATL', ['#9b5de5', '#eaac8b'], 0, 2),
  t('Miami', 'Riptide', 'MIA', ['#ff5d8f', '#023e8a'], 0, 2),
  t('Orlando', 'Starfire', 'ORL', ['#ff9f1c', '#5a189a'], 0, 2),
  t('Charlotte', 'Copperheads', 'CHA', ['#b87333', '#1d3557'], 0, 2),
  // Keystone Central
  t('Cleveland', 'Foundry', 'CLE', ['#e63946', '#a8dadc'], 0, 3),
  t('Detroit', 'Motormen', 'DET', ['#4f8fe0', '#e5e5e5'], 0, 3),
  t('Columbus', 'Navigators', 'COL', ['#2ec4b6', '#f1faee'], 0, 3),
  t('Louisville', 'Thoroughbreds', 'LOU', ['#9e2a2b', '#fff3b0'], 0, 3),
  // Frontier North
  t('Chicago', 'Windjammers', 'CHI', ['#6ca0dc', '#f1faee'], 1, 0),
  t('Minneapolis', 'Voyageurs', 'MIN', ['#a2d2ff', '#14213d'], 1, 0),
  t('Milwaukee', 'Lakehawks', 'MIL', ['#2b59c3', '#f2e8cf'], 1, 0),
  t('St. Louis', 'Archers', 'STL', ['#bc4749', '#ffffff'], 1, 0),
  // Frontier South
  t('Dallas', 'Longriders', 'DAL', ['#c06c2c', '#ffe6a7'], 1, 1),
  t('Houston', 'Wildcatters', 'HOU', ['#ffba08', '#212529'], 1, 1),
  t('San Antonio', 'Bluebonnets', 'SAN', ['#3a5bd9', '#f4a261'], 1, 1),
  t('New Orleans', 'Krewe', 'NOR', ['#7209b7', '#ffd60a'], 1, 1),
  // Frontier Mountain
  t('Denver', 'Ridgebacks', 'DEN', ['#1679c9', '#c0c0c0'], 1, 2),
  t('Salt Lake City', 'Peaks', 'SLC', ['#4cc9f0', '#3a0ca3'], 1, 2),
  t('Phoenix', 'Scorpions', 'PHX', ['#f3722c', '#2b2d42'], 1, 2),
  t('Oklahoma City', 'Twisters', 'OKC', ['#7fb3e0', '#f9c74f'], 1, 2),
  // Frontier Pacific
  t('Seattle', 'Orcas', 'SEA', ['#0b0c10', '#e0fbfc'], 1, 3),
  t('Portland', 'Rainmakers', 'POR', ['#5e60ce', '#f8f9fa'], 1, 3),
  t('San Francisco', 'Foghorns', 'SFO', ['#adb5bd', '#d00000'], 1, 3),
  t('Los Angeles', 'Condors', 'LAX', ['#ffbe0b', '#3a0ca3'], 1, 3),
];
