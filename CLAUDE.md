# Project: Retro arcade football with deep franchise management

> Project brief and living plan. Claude Code: read this whole file at the start of every session.
> Tick the checkboxes in "Progress tracker" as things are finished, and add dated notes under
> "Decisions & refinements" whenever the plan changes. Working name: "retro-football" (rename later).

---

## 0. How to work with me (instructions for Claude Code)

- I'm a UVA student with **zero coding experience**. Explain what you're doing in plain English, briefly.
- **One small step at a time.** Build it, help me test it (on my phone too), then commit to git before the next step.
- **Before writing code for a new stage, show me a short plan and wait for my approval.**
- When something breaks, check the browser console and dev server output yourself, then explain the fix simply.
- If a step needs me to do something outside the code (create an account, click something in a website), give me numbered steps. I can use **Claude in Chrome** for browser tasks.
- Flag anything that could cost money before doing it.
- This is a separate project from HooMaps (`C:\Users\vsvis\hoos-riding`). Don't touch that folder from here.

---

A mobile-first browser game. On-field play is simple, snappy, retro arcade football.
Off the field it is a deep, Football Manager-style management sim adapted to
American football: a living league, real trades, real stats, meaningful morale,
season-long storylines, realistic scouting and drafting.

It is installed on the phone's home screen as a PWA (no app store, no APK).

---

## Ground rules (always follow)

- **Everything is original.** Original art, team names, player names, logos, UI and
  text. Reference footage of other games may be used ONLY to study timing and motion.
  Never trace, recreate or approximate another game's sprites, logos, fonts or screens.
- **Fictional league only.** No real league names, team names, logos or real players.
- **Feel numbers live in one place.** Every feel-related value (speeds, accelerations,
  arc heights, durations, easing, catch radius, camera follow, screen shake, hit-pause)
  lives in `src/config/feel.ts`. Never hard-code these elsewhere.
- **Sim logic is separate from rendering.** `src/sim/`, `src/league/`, `src/players/`,
  `src/staff/`, `src/finance/`, `src/story/` contain pure TypeScript with no Phaser
  imports, so they can be unit-tested and run headless (e.g. simulate 10 seasons in
  a test to check balance).
- **Seeded randomness.** All randomness goes through a seeded RNG so bugs and
  balance issues can be reproduced.
- **Save data is versioned.** Every save has a `version` field and a migration
  function, so old saves keep working after updates.
- **Build in small, playable steps.** After each step the game must run. Prefer
  depth that the player can see and that changes outcomes over hidden complexity.
- **Mobile performance matters.** Keep the main thread smooth at 60fps. Heavy
  simulation (week sims, offseason processing) runs in a Web Worker.

---

## Stack

- Phaser 3 + TypeScript + Vite
- Storage: IndexedDB (via a small wrapper such as `idb`) for saves
- PWA: web app manifest + service worker (e.g. `vite-plugin-pwa`)
- Tests: Vitest for sim/league logic
- Hosting: GitHub Pages, Netlify or Vercel (HTTPS required for PWA install)

## Platform decisions

- **Orientation: LANDSCAPE** (locked; changed from portrait 2026-11-13, before stage 1).
  - The field runs **left-to-right** across the screen (offense drives toward the right
    edge), camera scrolls horizontally with the play.
  - Touch layout uses **two thumbs**: left side of the screen for moving/juking the
    ball carrier, right side for aiming/throwing and buttons (play call, timeout,
    throw away). Keep buttons in the bottom corners, clear of the notch side.
  - Menus and management screens are designed for a wide, short screen: side
    navigation rail on the left, content on the right; tables can be wide but must
    scroll vertically, never horizontally.
  - Manifest `"orientation": "landscape"`. **iPhone ignores this**, and Android only
    honors it when launched from the home screen, so the game also shows a friendly
    **"Rotate your phone"** screen whenever it's held in portrait (and pauses play).
- Touch controls first; mouse works too.
- Respect safe areas (notches, home indicator) with `env(safe-area-inset-*)`. In
  landscape the notch is on the LEFT or RIGHT side, depending on which way the phone is turned.
- Fullscreen standalone display mode when launched from the home screen.

---

## Set up early (do these in stage 1, not later)

1. **Feel tuning panel.** A toggleable debug overlay with sliders for every value in
   `feel.ts`. Changes apply live. A "copy values" button outputs the current values
   so they can be saved as new defaults.
2. **Phone testing.** Dev server runs on the local network (`vite --host`) so the game
   can be opened on the phone over Wi-Fi.
3. **Save export / import.** A button that downloads the full save as a `.json` file
   and a button that loads one back. Browsers (especially iOS Safari) can clear site
   data, so this protects long dynasties. Also keep an automatic rolling backup of
   the last 3 saves in IndexedDB.
4. **Game-feel details from the start:** anticipation squash before the throw, a ball
   shadow on the ground showing height, ease-in/ease-out on all movement, short
   hit-pause and light screen shake on big hits, a camera that slightly leads the
   ball, a catch animation, and a clear throw-arc preview while aiming.
5. **Deployment.** Set up free hosting early so the game can be played on the phone
   away from home.

---

## On-field gameplay (arcade layer)

- The player controls their team's **offense** in arcade mode: snap, dropback,
  drag-to-aim passing with a visible arc, receivers running routes, scrambling,
  swipe/drag to juke when running, sliding, throwing the ball away.
- **Defense and kicking are mostly simulated**, with optional light interaction
  (e.g. timing tap for kicks).
- **Ratings drive the arcade layer**: QB arm strength and accuracy affect ball speed
  and spread; receiver speed, route running and hands affect separation and catch
  chance; offensive line affects pocket time; defenders' ratings affect coverage,
  pass rush and tackling.
- **Morale, fatigue and form affect play** (e.g. a low-morale receiver drops more
  passes, a fatigued line breaks down sooner).
- **Game situations:** downs, distance, clock, timeouts, two-minute drill, red zone,
  overtime, weather (rain/snow/wind affecting passing and fumbles).
- **Play calling:** choose from the team's playbook before each snap; available plays
  depend on the offensive scheme and coordinator.

---

## Management depth (Football Manager-style systems, adapted to American football)

### Players
- **Attributes on a 1–20 scale**, grouped as:
  - Technical / positional (throwing power, short/medium/deep accuracy, release,
    route running, hands, ball security, blocking, pass rush moves, tackling,
    coverage, kicking power/accuracy, etc.)
  - Mental (vision, decisions, composure, anticipation, work rate, leadership,
    football IQ, aggression, bravery, concentration)
  - Physical (speed, acceleration, agility, strength, stamina, jumping, natural fitness)
- **Hidden attributes** the player never sees directly, only infers through reports
  and behaviour: consistency, injury proneness, big-game performance, professionalism,
  ambition, loyalty, pressure handling, temperament, adaptability, versatility.
- **Personality labels** derived from hidden attributes (e.g. "Model Professional",
  "Volatile", "Ambitious", "Loyal", "Low Determination") shown on the profile.
- **Current ability and potential ability.** Potential is hidden and only estimated
  by staff ("could become a solid starter", "elite potential").
- **Position familiarity**: natural, accomplished, competent, unconvincing, awkward.
  Players can be retrained to new positions over time.
- **Player traits / tendencies** (e.g. "throws into tight windows", "gambles on
  interceptions", "fights for extra yards", "plays through injuries").
- **Form, condition (fatigue), match sharpness, morale** tracked separately.
- **Full player profile screen:** attributes, ratings history graph, career stats,
  contract, injury history, personality, relationships, agent, staff reports.

### Development & training
- **Age curves by position** (RBs peak and decline early, QBs and kickers late).
- **Weekly training schedule** with intensity (risk of injury vs development).
- **Unit and individual training focus** (e.g. a QB focusing on deep accuracy, a
  DE on pass-rush moves).
- **Development depends on**: potential, age, training, coaching quality, facilities,
  playing time, professionalism and determination.
- **Mentoring**: veterans with strong personalities can be paired with young players
  to pass on traits and personality (good or bad).
- **Breakouts and busts**: occasional sudden jumps or stalls in development.
- **Training camp and preseason** with position battles.

### Staff
- **Roles**: offensive coordinator, defensive coordinator, special teams coordinator,
  position coaches, scouts, athletic trainers/medical staff, data analyst, general
  manager assistant.
- **Staff attributes** (teaching, tactical knowledge, motivating, judging ability,
  judging potential, injury prevention, physiotherapy, discipline, man management).
- **Coordinators have schemes** and playbooks; changing coordinators changes playbook
  options and how well players fit.
- **Staff advice**: assistants give recommendations (depth chart suggestions, trade
  targets, training changes, players who are unhappy).
- **Staff contracts, hiring, firing, and staff poaching** by other teams.

### Scouting
- **Knowledge level**: the more a player is scouted, the more accurate the shown
  attributes. Unscouted players show attribute **ranges** (e.g. "speed 12–17").
- **Scouting assignments** by region / college conference / position; scouting budget.
- **Scout accuracy depends on the scout's** judging ability and judging potential.
- **Scout reports**: pros/cons, comparable player, projected role, recommendation grade.
- **Pre-draft events**: combine (measurables), pro days, interviews (reveal personality
  hints), injury/medical red flags, character concerns.

### Draft
- **7 rounds**, generated draft classes with varying strength by year and position.
- **Hidden true ratings** vs scouted estimates, so busts and steals happen.
- **Draft board**: the player ranks prospects; staff offer their own board.
- **Mock drafts** in the news feed before the draft.
- **AI teams draft by need, best available and their own (imperfect) scouting.**
- **Trading picks** before and during the draft, including future picks.
- **Undrafted free agents** after the draft.
- **Rookie contracts** on a scale by pick position.

### Contracts, salary cap and free agency
- **Salary cap** that rises each year, minimum spend floor.
- **Contracts**: years, base salary, signing bonus (prorated cap hit), guaranteed money,
  incentives, option years.
- **Cap hits and dead cap** from cuts and trades.
- **Agents with personalities** who negotiate for players; some are tough, some are
  loyal to certain teams.
- **Negotiation flow**: offer, counter-offer, walk-away, deadline pressure; a player's
  priorities (money, winning, playing time, location, loyalty) affect what they accept.
- **Extensions, franchise tag, restructures, holdouts, contract demands after big seasons.**
- **Free agency period** with competing AI offers; players choose based on priorities.
- **Roster limits**: offseason roster max, final cuts to a game-day roster, practice squad.

### Trades
- **AI team valuation** considers: player age, ratings, potential, contract and cap hit,
  positional need, team strategy (contending / retooling / rebuilding), depth, and
  draft pick value.
- **AI teams trade with each other**, not just with the player.
- **Trade block**: the player lists players; AI teams make offers.
- **AI-initiated offers and counter-offers**, with staff advice on fairness.
- **Trade deadline** mid-season; rumours in the news feed beforehand.
- **Player reactions to trades**: unhappiness if a friend or leader is traded, upset
  when a player is traded away after a promise.

### Tactics & game plans
- **Offensive and defensive schemes** (e.g. air raid, west coast, power run, spread;
  4-3, 3-4, nickel-heavy, blitz-heavy) with player fit ratings.
- **Depth chart** for every position.
- **Weekly game plan**: opponent scouting report (their tendencies and weaknesses),
  emphasis choices (e.g. focus on run defense, attack their weak cornerback).
- **Simulated portions follow the team's scheme and game plan**, so tactics matter
  even when not playing the snap.

### Match simulation & stats
- **Full play-by-play simulation** for every league game, driven by ratings, schemes,
  game plans, form, morale, fatigue, weather and home advantage.
- **Box scores and per-player stats** for every game in the league.
- **Per-game player ratings** (e.g. 4.0–10.0) used by morale, awards and media.
- **League-wide stat leaders, team stats, records** (single game, season, career),
  advanced stats (completion % over expected, yards after catch, pressure rate,
  missed tackles, etc.).
- **In-game injuries** with severity.

### Morale, team dynamics & player interaction
- **Morale factors** listed on each player (playing time, contract, team results,
  promises kept/broken, relationships, how the coach treated them, media comments).
- **Team hierarchy**: team leaders, highly influential players, other players.
  Leaders' moods spread to the locker room.
- **Social groups / cliques** (e.g. by position group, veterans vs rookies); conflicts
  between groups.
- **Player relationships**: friendships, mentorships, rivalries, feuds.
- **Promises**: playing time, contract extension, signing a quality player, improving
  the team. Broken promises hurt morale and trust.
- **Player conversations** with tone options (calm, assertive, aggressive, supportive):
  praise, criticise form, discuss playing time, discuss contract, warn about conduct.
- **Team talks** before the game and at halftime, with tone options that affect
  performance depending on personalities.
- **Discipline**: fines, benching, suspensions for conduct issues.
- **Chemistry** score that slightly affects on-field performance.

### Media, news feed & storylines
- **Inbox / news feed** as the central hub: league news, game recaps, injuries,
  transactions, rumours, staff messages, player requests, owner messages.
- **Game recaps written from actual sim events** (key plays, standout players).
- **Press conferences** before and after games with response options that affect
  player morale, owner confidence, fan sentiment and rival coaches.
- **Journalists** with different styles and reliability for rumours.
- **Fan sentiment** tracker reacting to results, trades and signings.
- **Storyline engine**: multi-week story arcs with stages, choices and consequences
  that change ratings/morale/contracts. Examples:
  - star player unhappy with contract → holdout risk → trade request
  - rookie bursts onto the scene → hype → pressure → slump or breakout
  - locker-room feud between two leaders
  - veteran's final season and retirement tour
  - revenge game against a former team
  - playoff drought pressure on the coach
  - rivalry escalating through media comments
  - comeback from serious injury
  - quarterback controversy
- **Rival coaches** who respond in the media; mind games.

### Owner / board & coaching career
- **Owner expectations** each season (e.g. make playoffs, develop young players,
  stay under budget) and **job security / owner confidence**.
- **Owner meetings**: request facility upgrades, budget increases, contract extension.
- **Getting fired** is possible; the career continues with job offers from other teams.
- **Coach reputation** grows with success and affects which players and staff want
  to join.
- **Interest from other teams** in hiring the coach.

### Finances & facilities
- **Revenue**: tickets, merchandise, TV/media deals, sponsorships, playoff revenue.
- **Expenses**: player salaries, staff wages, scouting, medical, facilities.
- **Budgets** for scouting, medical and training, set by the owner.
- **Facilities**: training, medical, youth/scouting network, stadium; upgrades take
  seasons to build and affect development, injuries and revenue.

### Medical & fitness
- **Injury types with realistic durations**, re-injury risk, and long-term effects.
- **Injury risk** shown by medical staff; rushing players back raises it.
- **Fatigue and load management** across the season; bye weeks matter.
- **Medical reports** in the news feed.

### League world & history
- **Fictional league** with divisions and conferences, schedule generation, bye weeks,
  playoffs and a championship game.
- **Season calendar**: offseason → combine → free agency → draft → minicamp →
  training camp → preseason → final cuts → regular season → trade deadline → playoffs
  → awards → retirements.
- **Awards**: MVP, offensive/defensive player of the year, rookie of the year, coach of
  the year, all-league teams.
- **Hall of Fame**, retired numbers, franchise records, season-by-season history pages.
- **Retirements and newly generated players** each year so the league lives forever.
- **Coaching carousel**: AI head coaches get fired and hired.
- **AI team strategies** change over time (contend, retool, rebuild).

---

## Feel notes (starting values for `feel.ts`)

Taken from timing study of a reference arcade football game (timing/flow only, no art
or layout copied). These are **starting points**, tuned later with the feel panel.

| Value | Start | Notes |
|---|---|---|
| Pocket time before sack | ~3.0s | Later scaled by O-line vs pass-rush ratings. Visual pressure cue at ~2s. |
| Earliest throw after snap | ~0.3s | Aim arc appears instantly on drag; QB auto-drops back while aiming. |
| Ball flight time | ~0.5s (5 yd), ~1.0s (12 yd), ~1.6s (25 yd) | Flight time grows slower than distance. Scaled by arm strength. |
| Max throw distance | >15 yd, set by arm strength | Deep shots must be possible. |
| Catch radius | More forgiving than reference | Receivers turn and adjust 1–2 yd toward the landing marker. |
| Result banner | ~0.8–1.0s | Tap to skip. |
| Dead ball → next play ready | ~1.0–1.5s | No long walk-back; tap to skip. |

Flow decisions:
- Pre-snap: route lines shown, hidden on snap. Drag-to-aim on the right side with a live
  dotted arc; on release a landing marker appears on the ground. Test pull-back
  (slingshot) vs push-toward-target and keep the one that feels better.
- Control transfers to the receiver instantly on the catch (then swipe to juke).
- "Open receiver" hint shortly after snap; later its timing depends on QB vision/decisions.
- Success feedback stacks: catch pop → yards-gained popup → shake on big gains.
- Quick taps register everywhere (no press-and-hold-only inputs).
- Our offense always drives left-to-right (no field flip between quarters).
- Opponent drives: a few-second skippable summary, not a long text scroll.
- 4th-down choice only appears when it matters. Kick returns: not in stage 1 (maybe optional later).
- Art (stage 13) must use a different camera, palette and layout from the reference game.

---

## Build stages

1. **Feel prototype**: project setup, PWA basics, local-network testing, feel tuning
   panel, save export/import skeleton. One QB throwing to one receiver, then routes,
   a basic defense, catch/incompletion/tackle. Iterate until throwing feels great.
2. **Full games**: downs, clock, scoring, play calling, simulated defense and kicking,
   end-of-game screen.
3. **Players and teams**: attribute system, hidden attributes, personalities, rosters
   for a full fictional league, ratings affecting the arcade layer.
4. **Season and league sim**: schedule, play-by-play sim for other games (Web Worker),
   standings, box scores, league stats, playoffs.
5. **News feed / inbox** and game recaps from sim events.
6. **Contracts, salary cap, free agency, trades** (including AI–AI trades).
7. **Scouting and draft** with knowledge levels and hidden true ratings.
8. **Development, training and staff.**
9. **Morale, team dynamics, conversations, promises, team talks, press conferences.**
10. **Storyline engine.**
11. **Owner, finances, facilities, coaching career.**
12. **History, awards, Hall of Fame, multi-season balance testing** (simulate 20+
    seasons headless and check for stat inflation, dynasty dominance, cap problems).
13. **Polish**: art pass, sound, transitions, tutorials/tooltips, offline caching,
    performance on low-end phones.

## Definition of done for each stage
- The game runs on the phone from the home screen.
- Saves from the previous stage still load (migration written if the format changed).
- Sim logic for the stage has unit tests.
- No feel-related values hard-coded outside `feel.ts`.

---

## Progress tracker

| Stage | Status | Notes |
|---|---|---|
| 1 Feel prototype | In progress (2026-11-14) | Plan approved |
| 2–13 | Not started | |

Stage 1 steps:
- [x] 1. Project setup: Phaser + TS + Vite, blank landscape screen, rotate-your-phone overlay, `feel.ts`, `vite --host`, Vitest (2026-11-14; tested on desktop and phone)
- [x] 2. PWA install to home screen (2026-11-14; done together with hosting, works on phone)
- [x] 3. Feel tuning panel (2026-11-14): `src/debug/feelPanel.ts` + tested helpers in `src/config/feelTools.ts`. Sliders auto-built from `feel.ts`; tweaks saved in localStorage; scenes listen for the `feelchange` window event to react live.
- [x] 4. Save export/import skeleton + seeded RNG (2026-11-14): `src/sim/rng.ts` (mulberry32, saveable state), `src/save/saveFormat.ts` (version + migrations + 3 rolling backups, tested), `saveStore.ts` (IndexedDB via `idb`), `saveSession.ts` (`getRng()` / `commitSave()`). Export/Import buttons in the ⚙ panel; phones use the share sheet, desktops download. Tested on PC and phone.
- [x] 5. QB throws to one receiver (aim arc, ball shadow, catch) (2026-11-14): math in `src/sim/throw.ts` (tested); scene in `FieldScene.ts`. Aim style: **slingshot (aimMode 1) chosen** after phone test. Added `camera.zoomScale` (1.5) because the whole field fit on screen and players were tiny. Phone tested: feels good. Ball a bit slow (arm strength will speed it up in stage 3); arc reads like a straight line from the top-down view, so revisit height cues once defenders exist.
- [x] 6. Routes (2026-11-14): `src/sim/routes.ts` (Slant/Out/Go, acceleration, slowdown at cuts, tested). Tap anywhere to snap (user's idea, replaces a Snap button); route line shown pre-snap; QB drops back; earliest release 0.3s; pressure cue (red QB outline) and placeholder SACKED at `pocket.sackTime` until the pass rush exists. Routes rotate each play until play calling (stage 2).
- [x] 7. Basic defense (2026-11-14): `src/sim/defense.ts` (tested). Cornerback in man coverage (reaction delay, closing cushion, slower break on the ball), contested catches: catch / DROPPED / BROKEN UP / INTERCEPTED / LUCKY! (defender dropped it; user wanted one word) via seeded RNG. A ball thrown straight to the defender is a pick 75% of the time, never 'incomplete' (user feedback); open receivers catch 95%. Both chances become hands ratings in stage 3. Two rushers vs two blockers replace the fixed sack timer (tuned to ~3s); red pressure outline when a rusher is close. Balance test: a well-led on-time slant is caught 60%+ of the time.
- [ ] 8. Catch / incompletion / tackle
- [x] 9. Free hosting (2026-11-14, moved earlier): https://vishalvs23.github.io/retro-football/

## Decisions & refinements

- **2026-11-13: Project created** in its own folder `C:\Users\vsvis\retro-football`, separate from HooMaps.
- **2026-11-13: Orientation switched to LANDSCAPE** (user's choice, before stage 1). Field runs left-to-right, two-thumb controls, "Rotate your phone" screen in portrait because iPhone can't lock orientation for home-screen web apps.
- **2026-11-14: Hosting moved up** to right after step 1 (phone wasn't on the same Wi-Fi; PWA install needs HTTPS). Public repo `VishalVS23/retro-football`, GitHub Pages via Actions: every push to `main` runs tests, builds and deploys to https://vishalvs23.github.io/retro-football/. CI uses `npm install` (not `npm ci`) because the Windows lock file lacks Linux-only optional deps. Run tests from PowerShell (Git Bash's lowercase `c:` path crashes Vitest).
- **2026-11-14: Feel notes added** from a timing study of a reference game (see "Feel notes"). Stage 1 plan approved.
- **2026-11-14: No code, art or files from Retro Bowl (or any copy of it) are used.** User shared GitHub copies; declined because the game is commercial and the project must be original. One linked "launcher" README showed malware signs (Telegram download, "disable antivirus"). Feel comes only from timing notes plus tuning with the sliders.
- **2026-11-14: Slingshot aiming chosen** (pull back away from the target). Flight times stay as they are for now; better QBs will throw faster once ratings arrive in stage 3.
- **2026-11-14: Tap anywhere to snap** (no Snap button). Optional throwing-zone glow hint (with an off switch) parked for later; the "TAP to snap" text covers it for now.
- **2026-11-14: App icon** is the user's own pixel-art football (converted to `public/icon.svg`, a crisp 22x22 pixel grid). Phone icon background is turf green `#2f6b4f` so the ball's dark outline shows.
- **2026-11-14: Visual direction = the user's OWN pixel UI kit** ("retro gridiron UI kit" they designed, not from Retro Bowl), so it can be used directly: chunky pixel UI, thick dark outlines, outlined panels/cards, bright colour-coded buttons, position chips (QB/WR/RB/DB in different colours), segmented rating bars, pixel font (use an open-licence one, e.g. OFL). Ask the user for the kit's source files when building menus. Route art: thick yellow line, navy outline, chunky arrowhead, **static** (user disliked animated chevrons).
- **2026-11-14: Receiver dodge bug fixed.** His drift toward the ball is now aimed from where his route will put him at landing (`receiverInFlight` in `routes.ts`), so he never swerves away from an underthrown ball. User wants sack time and receiver speed to come from ratings in stage 3 (pass rush vs O-line; receiver speed).
- **2026-11-14: Play-call screen design (user's own mockup)** = target for stage 2 play calling: top bar (down & distance, field zone, offense type), big field diagram with labelled yellow routes and arrowheads, players as pixel sprites with position labels, right-side PLAY SELECT list of playbook cards (mini route diagrams, checkbox on the chosen one), bottom-left player form card (speed/catch/agility bars plus last-3-games trends), buttons EXECUTE PLAY (green), AUDIBLE (gold), CANCEL (red), TEAM. Ask the user for the image files when building it.
