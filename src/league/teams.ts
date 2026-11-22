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
  t('New York', 'Ferrymen', 'NYF', ['#e8743b', '#f2e8cf'], 0, 0),
  t('Buffalo', 'Gales', 'BUF', ['#5fa8d3', '#22333b'], 0, 0),
  t('Pittsburgh', 'Ironclads', 'PIT', ['#e0a526', '#2b2d42'], 0, 0),
  // Keystone East
  t('Philadelphia', 'Founders', 'PHI', ['#c98a3d', '#2b2d42'], 0, 1),
  t('Baltimore', 'Schooners', 'BAL', ['#c08552', '#fdfcdc'], 0, 1),
  t('Washington', 'Sentinels', 'WAS', ['#8d99ae', '#1d3557'], 0, 1),
  t('Raleigh', 'Pines', 'RAL', ['#e9b949', '#1b4332'], 0, 1),
  // Keystone South
  t('Atlanta', 'Ironhorses', 'ATL', ['#d64045', '#c0c0c0'], 0, 2),
  t('Miami', 'Riptide', 'MIA', ['#1fb5c4', '#ff7f50'], 0, 2),
  t('Orlando', 'Starfire', 'ORL', ['#ff9f1c', '#5a189a'], 0, 2),
  t('Charlotte', 'Copperheads', 'CHA', ['#b87333', '#1d3557'], 0, 2),
  // Keystone Central
  t('Cleveland', 'Foundry', 'CLE', ['#f26b1d', '#212529'], 0, 3),
  t('Detroit', 'Motormen', 'DET', ['#4f8fe0', '#e5e5e5'], 0, 3),
  t('Columbus', 'Navigators', 'COL', ['#d9a441', '#1d3557'], 0, 3),
  t('Louisville', 'Thoroughbreds', 'LOU', ['#c1121f', '#e9b949'], 0, 3),
  // Frontier North
  t('Chicago', 'Windjammers', 'CHI', ['#6ca0dc', '#f1faee'], 1, 0),
  t('Minneapolis', 'Voyageurs', 'MIN', ['#7b4fc9', '#e9c46a'], 1, 0),
  t('Milwaukee', 'Lakehawks', 'MIL', ['#2b59c3', '#f2e8cf'], 1, 0),
  t('St. Louis', 'Archers', 'STL', ['#e9c46a', '#1d3557'], 1, 0),
  // Frontier South
  t('Dallas', 'Longriders', 'DAL', ['#c9a36b', '#2ec4b6'], 1, 1),
  t('Houston', 'Wildcatters', 'HOU', ['#e04a3a', '#ffba08'], 1, 1),
  t('San Antonio', 'Bluebonnets', 'SAN', ['#3a5bd9', '#f4a261'], 1, 1),
  t('New Orleans', 'Krewe', 'NOR', ['#7209b7', '#ffd60a'], 1, 1),
  // Frontier Mountain
  t('Denver', 'Ridgebacks', 'DEN', ['#b5793a', '#f2e8cf'], 1, 2),
  t('Salt Lake City', 'Peaks', 'SLC', ['#4cc9f0', '#3a0ca3'], 1, 2),
  t('Phoenix', 'Scorpions', 'PHX', ['#f3722c', '#2b2d42'], 1, 2),
  t('Oklahoma City', 'Twisters', 'OKC', ['#7fb3e0', '#f9c74f'], 1, 2),
  // Frontier Pacific
  t('Seattle', 'Orcas', 'SEA', ['#0b0c10', '#e0fbfc'], 1, 3),
  t('Portland', 'Rainmakers', 'POR', ['#3b8beb', '#f8f9fa'], 1, 3),
  t('San Francisco', 'Foghorns', 'SFO', ['#e03131', '#f8f9fa'], 1, 3),
  t('Los Angeles', 'Condors', 'LAX', ['#ffbe0b', '#3a0ca3'], 1, 3),
];

/**
 * Teams with a logo in public/logos/<ABBR>.png: the user's own pixel-art logos (2026-11-22), cut
 * from design-refs/team_logos_original.png. A team missing from this set shows a colour dot instead.
 */
export const TEAM_LOGOS: ReadonlySet<string> = new Set(TEAM_DEFS.map((t) => t.abbr));
