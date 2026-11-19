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
| 1 Feel prototype | **Done** (2026-11-14) | All 9 steps built and tested on phone |
| 2 Full games | **In progress** (plan approved 2026-11-14) | 2-minute quarters. Steps 1–5 done; 6a (CPU drives) built, waiting for phone test |
| 3–13 | Not started | |

Stage 1 steps:
- [x] 1. Project setup: Phaser + TS + Vite, blank landscape screen, rotate-your-phone overlay, `feel.ts`, `vite --host`, Vitest (2026-11-14; tested on desktop and phone)
- [x] 2. PWA install to home screen (2026-11-14; done together with hosting, works on phone)
- [x] 3. Feel tuning panel (2026-11-14): `src/debug/feelPanel.ts` + tested helpers in `src/config/feelTools.ts`. Sliders auto-built from `feel.ts`; tweaks saved in localStorage; scenes listen for the `feelchange` window event to react live.
- [x] 4. Save export/import skeleton + seeded RNG (2026-11-14): `src/sim/rng.ts` (mulberry32, saveable state), `src/save/saveFormat.ts` (version + migrations + 3 rolling backups, tested), `saveStore.ts` (IndexedDB via `idb`), `saveSession.ts` (`getRng()` / `commitSave()`). Export/Import buttons in the ⚙ panel; phones use the share sheet, desktops download. Tested on PC and phone.
- [x] 5. QB throws to one receiver (aim arc, ball shadow, catch) (2026-11-14): math in `src/sim/throw.ts` (tested); scene in `FieldScene.ts`. Aim style: **slingshot (aimMode 1) chosen** after phone test. Added `camera.zoomScale` (1.5) because the whole field fit on screen and players were tiny. Phone tested: feels good. Ball a bit slow (arm strength will speed it up in stage 3); arc reads like a straight line from the top-down view, so revisit height cues once defenders exist.
- [x] 6. Routes (2026-11-14): `src/sim/routes.ts` (Slant/Out/Go, acceleration, slowdown at cuts, tested). Tap anywhere to snap (user's idea, replaces a Snap button); route line shown pre-snap; QB drops back; earliest release 0.3s; pressure cue (red QB outline) and placeholder SACKED at `pocket.sackTime` until the pass rush exists. Routes rotate each play until play calling (stage 2).
- [x] 7. Basic defense (2026-11-14): `src/sim/defense.ts` (tested). Cornerback in man coverage (reaction delay, closing cushion, slower break on the ball), contested catches: catch / DROPPED / BROKEN UP / INTERCEPTED / LUCKY! (defender dropped it; user wanted one word) via seeded RNG. A ball thrown straight to the defender is a pick 75% of the time, never 'incomplete' (user feedback); open receivers catch 95%. Both chances become hands ratings in stage 3. Two rushers vs two blockers replace the fixed sack timer (tuned to ~3s); red pressure outline when a rusher is close. Balance test: a well-led on-time slant is caught 60%+ of the time.
- [x] 8. Catch / incompletion / tackle (2026-11-14): `src/sim/carry.ts` (tested). After the catch the receiver auto-runs; any thumb drags up/down to steer, a quick flick jukes (cooldown). Defenders (CB, new deep safety, rushers) chase with a reaction delay and pursuit angle; tackle attempts can be broken or juked (seeded RNG), 0.2s grace after the catch. Ends: TACKLED (hit-pause + shake), OUT OF BOUNDS, TOUCHDOWN!. Fixed screen shake being hugely over-scaled by the zoomed camera (`shakeScreen` helper). Catches/picks only count with the catcher's centre point (feet) in bounds (`isInBounds`). Phone tested: everything works, movement feels good.
- [x] 9. Free hosting (2026-11-14, moved earlier): https://vishalvs23.github.io/retro-football/

Stage 2 steps (approved 2026-11-14; still show a short plan for each step before coding):
- [x] 1. Game state: downs, distance, line of scrimmage moves with each play, first downs, turnover on downs, scoreboard bar. **Done 2026-11-14, phone tested.** Rules in `src/sim/drive.ts` (tested): ball spotted to the nearest yard, never on a goal line; sacks/tackles behind our goal line = safety; touchdown = 6 (no PAT yet). Until steps 5–6, every drive-ending event restarts at our 25. Scene field is `match` (not `game`: that name belongs to Phaser). Hint text moved to bottom-left; scoreboard top-centre.
- [x] 2. Three receivers per play, each with his own cornerback (read the open man). **Done 2026-11-14, phone tested** (user: "I make some, I drop some, I get intercepted some"). (Swapped with play calling on 2026-11-14, user approved: plays need 3 receivers to mean anything.) Formation: two receivers top (wide + slot), one bottom. `PLAYS` in `routes.ts` (Slants, Verticals, Post Corner, Crossers) rotate each snap. Pass goes to the receiver nearest the landing spot, and the nearest defender (any cornerback) contests: `resolveTargetedPass` in `defense.ts` (tested). All cornerbacks break on a thrown ball; the safety does not contest catches yet. Non-carriers keep running routes after a catch. Sideways routes shortened so route art fits the 1.5x camera; pre-throw camera sits 3 yd above the middle (`FORMATION_VIEW_Y`).
- [x] 2b. Bullet pass (user request, approved 2026-11-14). **Done 2026-11-14, phone tested.** While aiming, tap with the other thumb to toggle bullet (light-blue flat preview, smaller catch circle, hint text changes). Faster and flatter, but max 25 yd, smaller catch zone, lower catch chance. Values in `feel.bullet`; `makeThrow` takes a flight-time ratio, `clampDistance` in `throw.ts` (tested). Later: arm strength / hands ratings.
- [x] 2c. Interception returns (user request, approved 2026-11-14). **Done 2026-11-14, phone tested** ("feels good overall"). New scene state `return`: the picking defender runs left (`dirX = -1` in `carry.ts`: `stepCarrier`, `stepPursuers`, `playEnd`), dodging with `evadeSteer`; our WRs, QB and linemen chase and tackle with the existing pursuit/tackle code. Banners: STOPPED! / OUT OF BOUNDS / PICK SIX! plus "N YD RETURN". Tap skips (sims the rest instantly). `drive.ts`: `interception` outcome now carries `returnedTo`; `pickSix` = 6 to them; pick downed in their end zone = touchback at their 20; `GameState.oppStartX` stores where the opponent takes over (also set on turnover on downs) for step 6. Values in `feel.interception`. First tuning had 8/8 pick-sixes; fixed with `returnTurnTime` 0.6s (returner accelerates after turning around) and `returnSpeed` 6.2 (below WR chase 7.2): 0/14 pick-sixes, 1–33 yd returns on deliberately bad throws.
- [x] 2d. Three fixes from the user's feedback (approved 2026-11-14). **Done 2026-11-15** (user moved on without issues). (1) **SKIP button** (DOM `#skip-btn`, bottom-right, only during returns and result banners); taps on the field no longer skip (user kept skipping by accident). (2) **SPACE toggles bullet** while aiming with a mouse (laptop has no second thumb). (3) **Safety contests passes** (4th defender in `resolveTargetedPass`). Browser check: 30 deep seams into the middle gave 9 catches, 14 broken up, 5 safety picks, 2 drops.
- [x] 3. Play calling screen (split into 3a screen and 3b hot routes + more plays, see Decisions 2026-11-15). **Done 2026-11-16.**
  - [x] 3a. **Done 2026-11-16, phone tested.** `src/ui/playCall.ts` + `playCall.css` (HTML overlay, Press Start 2P via `@fontsource/press-start-2p`, woff2 precached), `src/ui/playDiagram.ts` (SVG play diagrams; big one fits its box, minis fixed 42 yd centred). `src/sim/formation.ts` (formation moved out of the scene), `src/sim/playcall.ts` `fieldZone` (tested). Scene state `calling`; `resetPlay(call = true)` opens the screen after every play with the last play ticked; EXECUTE lines up the pick, CANCEL keeps the current play, blue PLAYS button (bottom-right, pre-snap only) reopens it. Plays no longer rotate. AUDIBLE and TEAM greyed. Enter = execute, Esc = cancel. OFFENSE chip hides under 760px wide.
  - [x] 3b. **Done 2026-11-16, phone tested** ("works great"). AUDIBLE toggles audible mode on the play-call screen (pink frame, pulsing rings, hint bar); tap a receiver in the big diagram to cycle his route (`nextRoute`, order = `ROUTES`); changed routes drawn pink. Hot routes last ONE snap (`FieldScene.calledPlay`, reset to `PLAYS[playIndex]` whenever the screen opens after a play; reopening PLAYS before the snap keeps them). Stop routes Hitch/Curl (`RouteDef.stop`: receiver plants on the last point). New plays Hitch Slant, Curls (6 total). Big diagram now shows y 4.5-49.5 so Out routes fit. Old notes: based on the user's mockup (playbook cards with mini route diagrams, field preview, EXECUTE / AUDIBLE / CANCEL); ~6 pass plays to start. **Include hot routes**: tap a receiver pre-snap to change his route (user request).
- [x] 3c. QB scramble (user request 2026-11-16, plan approved). **Done 2026-11-16, phone tested** ("seems good for now"). While aiming, an aim within `feel.scramble.runAimAngle` (60 deg) of straight back (`isRunAim` in `throw.ts`, tested) shows a green RUN arrow instead of the arc (slingshot: drag your thumb FORWARD); release = QB runs with the receiver run controls (`startRun(qbPos, null)`, `qbRun` flag, speed `feel.scramble.qbRunSpeed` 6.5). No throwing after. Our line keeps blocking: each rusher stays stuck (pursuer `stunned`) until his own shed time. Tackled behind the line = SACKED banner; own end zone = safety (drive rules already handle it). Browser check: unsteered scramble up the middle gains ~3 yd; a late scramble can be sacked.
- [x] 3d. Running back (user request, plan approved 2026-11-16, before the clock because clock rules differ for runs). **Done 2026-11-17, phone tested** ("works well"). RB lines up behind the QB (`formation().rb`, `RB_OFFSET`); plays now have 4 routes in `formation().skill` order [wide top, slot top, wide bottom, RB] (`RB` = 3). Pass plays give the RB a checkdown route (`RB_ROUTES`: Flat, Check, Wheel; AUDIBLE cycles them). New run plays **Dive** (inside) and **Toss** (QB pitches it wide to the bottom side) (`PlayDef.run`): no throwing; the RB gets the ball at the 2nd point of his path (`reachedHandoff`), follows his lane (`laneSteer`) until you drag, then steer/juke as usual; STUFFED! banner for no gain. A **linebacker** (index RB in `cbDots`) covers the RB: holds `lbFloorYards` past the line on runs, drops to `lbPassDropYards` on passes, pauses `lbReadTime` after a handoff. Run blocking: rushers are `held` (pushed back and away from the runner at `runGame.driveSpeed`, can't tackle) until their run shed time. Run loop moved into pure `stepChase` (`carry.ts`), used for runs, scrambles and interception returns; headless run sim in `src/sim/runSim.ts`. Balance (300 headless runs): runner who jukes the first tackler: Dive ~3.5, Toss ~5.6 yd; never juking ~2 yd and stuffed 12-18%. Browser check: RB checkdown (Flat) caught 11/12, ~3.7 yd. Values in `feel.runGame` and `feel.defense.lb*`. 127 tests.
- [x] 3e. Follow-ups from the 3d phone test (user feedback 2026-11-17). **Done 2026-11-17, phone tested** ("feels good"). (1) **No more guaranteed big plays after one move:** chasers faster than ball carriers, jukes cost speed, shorter stumble (see Decisions 2026-11-17). (2) **Teammates without the ball stop drifting to the right:** once someone else has the ball (catch, handoff, scramble) each receiver / RB pulls up out of his route over `teammates.stopTime` (0.5s), then jogs after the play (`stepTrailer` in `carry.ts`, tested): 3 yd behind the carrier, at most 8 yd to the side, never ahead of him. Looks only, no effect on yards. 130 tests.
- [x] 3f. Go down on your own (user request 2026-11-17, plan approved). **Done 2026-11-17, phone tested** ("seems fine"). While running with the ball, a quick **flick FORWARD** (toward their end zone; up/down flicks still juke) or the **D** key = **dive**: 1-3 yd straight ahead, longer the faster he's running (full speed = `feel.dive.maxYards` 3, just after a juke = `minYards` 1), over `dive.time` 0.3s; nobody can tackle him during it. A scrambling QB **slides** instead (0 yd, `dive.qbSlideTime`). Banners DOWN / SLIDE; spotted in bounds, so the clock keeps running; diving over the goal line = TD, down in our own end zone = safety. Pure logic in `carry.ts` (`startDive`, `diveYards`, `forwardRatio`; `stepChase` returns end 'down'), tested. 145 tests.
- [x] 4. Game clock and quarters, timeouts, late-quarter warning. **Done 2026-11-17, phone tested** ("seems fine"; plan: 5s huddle, 30-second warning). Rules in `src/sim/clock.ts` (tested): clock runs in real time while the ball is live (`tickPlay`, never below 0:00, a play always finishes); `endPlay` keeps it running after a tackle in bounds (first downs too) and stops it for incompletions, out of bounds, scores, turnovers, safeties (`playStopsClock`); `beforeSnap` takes the huddle runoff (`feel.clock.huddleRunoff` 5s) at the snap if it's still running, which can run out the quarter or stop at 0:30 for the warning (no snap then, tap again). **TIMEOUT (n)** button on the play-call screen (purple, next to CANCEL; greyed when the clock is stopped or none left; 3 per half, reset at halftime; see Decisions 2026-11-17). 30 SEC WARNING once in Q2/Q4. Banners END OF Q1 / HALFTIME / FINAL 14-2 (`feel.pacing.breakBannerTime`, SKIP works); the scoreboard shows 0:00 until the break banner. Halftime = new drive at our 25 (`startDrive` in `drive.ts`); FINAL = new game. Scoreboard `YOU 0 - 0 CPU  Q1 1:42  1st & 10 · OWN 25` (only redrawn when the text changes); clock chip on the play-call bar; hint says "(clock running: -5s)". Play-call screen time never counts. 141 tests.
- [x] 5. Scoring and kicking: TD, extra point, field goal, punt (timing tap), 4th-down choice only when it matters. Plan approved 2026-11-17 (one-tap meter, 2-pt try in 5a). **Done 2026-11-18** (5a-5c below).
  - [x] 5a. **Done 2026-11-17, phone tested** (user: meter maybe a bit easy, fine until kicker ratings in Stage 3). Rules: `src/sim/kicking.ts` (tested): `fieldGoalDistance` (LOS + 7 hold + 10 end zone, posts on the end line), `kickDifficulty` (green zone half-width and sweep time shrink from `nearYards` 20 to `maxRangeYards` 55), `meterPosition` (bounces -1..1, starts left), `resolveKick` (outside the green = WIDE LEFT/RIGHT, left = top of screen; off-centre taps lose up to `powerLossRatio` of range = SHORT). `drive.ts`: a touchdown now sets `tryPending` at their 2 (`TRY_X`); `applyTryPlay` (into the end zone = +2, anything else over; pick returned all the way = 2 to them); `applyKick` (FG +3, XP +1, missed FG = their ball at the kick spot or their 20, in `oppStartX`). `downText` says TRY. Scene: states `kickAim` / `kickFlight`; DOM meter `#kick-meter` (pointer-events none, any tap or SPACE kicks); FIELD GOAL (n YD) button on the play-call screen on ANY down when in range (hides greyed TEAM); on a try it says KICK XP and EXECUTE says GO FOR 2. A kick takes the huddle runoff like a snap; FG takes `kicking.clockRunoff` 5s; the try is untimed and a touchdown at 0:00 still gets its try before the break (`finishPlay`). Goalposts drawn on both end lines. Values in `feel.kicking`. Browser check: centred 37-yd FG GOOD (+3, -5s), far-left tap WIDE LEFT (opp at kick spot), no FG button at own 40, TD at 0:00 Q2 -> try -> XP -> HALFTIME. 158 tests.
  - [x] 5c. Punt returns (user asked 2026-11-18; plan approved, coverage automatic). **Done 2026-11-18, phone tested** ("the fair catch and returns look good"). Pure play in `src/sim/puntReturn.ts` (tested, `simulatePunt` runs it headless): their deep safety = returner, drifts under the ball (`returnerStart`); our coverage team (`coverageAt`: [...wrDots, ...blockerDots, qb]; the two wide receivers are gunners, the rest release after `coverReleaseTime`, each slowed at random by up to `coverSpeedVariance`) races to the landing spot; their corners + rushers are blockers (`ReturnBlocker`: each gets one try to hold up a cover man, `blockChance` / `blockHoldTime`, uses `Pursuer.held`). When it comes down (`decide`): out of reach / out in the air / lands inside his 10 = bounce (5b rules); nearest cover man <= `fairCatchYards` 12 = FAIR CATCH, up to `fairCatchMaxYards` 20 a falling chance; then `muffChance` 4% = MUFFED! (our ball, 1st & 10 there: `applyMuffedPunt`); else he returns it with the interception-return chase (`stepChase`, dirX -1, `evadeSteer`). Return TD = `applyPuntReturnTD` (6 to them). Scene: `puntPlay` replaces `puntFlight`; SKIP works during the punt; meter hides when the ball comes down; banners FAIR CATCH / STOPPED! / OUT OF BOUNDS / MUFFED! / PUNT RETURN TD plus "11 YD RETURN · OPP 46". Clock: still a flat `punting.clockRunoff` 6s. Tuning (see Decisions 2026-11-18): `hangTime` 2.8, `centreYards` 60 / `edgeYards` 46 (longer punts so returns don't wreck the net), `gunnerSpeed` 10. Balance (400 headless punts from our 30, taps across the green): ~38% fair catches, returns average ~10 yd, ~6% go 15+, a return TD ~1 in 400; a centred punt nets 30+ yd. Values in `feel.puntReturn`. 188 tests.
  - [x] 5b. **Done 2026-11-18, phone tested** ("works well"). Rules: `src/sim/punting.ts` (tested): `resolvePunt` (same meter: centre tap 50 yd, edge of green 38 yd with a little drift to that side, red = SHANK 20-30 yd slicing toward that sideline), `puntPath` (flight, then roll along the flight direction: lands in their end zone or rolls in = TOUCHBACK at their 20; over a sideline in the air or on the roll = their ball where it went out; else where it stops), `insideTwenty`, `PUNTER_DEPTH` 15. `drive.ts` `applyPunt` (their ball at the spot in `oppStartX`, event `punt`; our next drive still at our 25 until step 6). `src/sim/fourthDown.ts` `coachTip` (tested): end of half (Q2 <= 0:15) kick if in range else go; Q4 <= 1:00 behind: FG only if it ties/wins, else go; ahead: FG in range else punt; otherwise 4th & <=2 inside their 40 = go, 4th & 1 from our 35 on = go, in range = FG, no man's land (their 45 in, <=4 to go) = go, else punt. Play-call screen on 4th down: teal PUNT button, COACH tip strip along the top of the diagram, the coach's pick has a gold outline; the kick button shortens to FG (n YD) on 4th; TEAM hides. Scene: kickKind `punt` reuses `kickAim`/`kickFlight` (`puntFlight`: air then roll); banners SHANK! / TOUCHBACK / INSIDE THE 20! / OUT OF BOUNDS / PUNT plus "42 YD · OPP 18"; `feel.punting.clockRunoff` 6s. Field goal stays available on any down in range (user approved the plan with that). Browser check (844x390 and 667x375): buttons fit on one line; centred punt from own 30 -> their 30, worst shank -> own 36, from their 45 -> their 5 (INSIDE THE 20!), from their 25 -> touchback. 178 tests.
- [ ] 6. Simulated opponent drives: short skippable summary (simple sim; real league sim is stage 4). Plan approved 2026-11-18 (user chose this before fumbles): 6a = drives + summary + field position, 6b = clock smarts.
  - [ ] 6a. **Built 2026-11-18, waiting for the user's phone test.** `src/sim/oppDrive.ts` (tested): `simulateOppDrive` is a play-by-play dice sim in THEIR frame (t = 120 - x): runs/passes/incompletes/sacks/big plays, a pick per pass and a lost fumble per run/catch, 4th down uses our `coachTip` mirrored (us/them swapped), FG make chance `oppFieldGoalChance` (sure to 30 yd, `fgLongChance` at 52), XP 95%, net punt 34-46 yd (in our end zone = our 20). Never runs past the end of the half (`endOfHalf`), can carry from Q1 into Q2. Results: touchdown / fieldGoal / missedFieldGoal (our ball at the kick spot or our 20) / punt / interception / fumble / downs / endOfHalf, plus plays, yards, seconds, `ourStartX`, `bigPlay` (20+ yd). `drive.ts`: after our score (try done, FG) they start at their 25 (`KICKOFF_X`, no kickoffs: always a touchback); after a safety at their 35 (`SAFETY_KICK_X`, free kick); after their score (pick six, punt return TD, CPU drive) we start at our 25; `applyOppDrive`, `secondHalf` (CPU gets the ball to start Q3). `clock.ts` `runOff` (tested): takes the drive's time, clock stopped after, Q1/Q3 carry into the next quarter (event endQuarter), Q2/Q4 end at 0:00 (halftime/final), a drive past 0:30 uses up the warning. Scene: `afterPlay` runs `runOppDrive` whenever `match.oppStartX` is set (after any break banner); state `oppDrive`; DOM panel `src/ui/driveSummary.ts` + `.css` (CPU BALL · OPP 25 / 8 PLAYS · 61 YDS · 0:48 / BIG PLAY line / mini field strip / result in red or green / YOUR BALL · OWN 30 / score / CONTINUE or Enter; no auto-advance, see Decisions 2026-11-19). Values in `feel.oppDrive` (`strength` 1 = average CPU offense; Stage 3: their ratings). Balance (5000 drives from their 25): 1.8 pts/drive, TD 21%, FG 11%, punt 50%, turnovers 11%, ~7 plays, ~48 s. Browser check (844x390, 667x375): CONTINUE works; Q2 0:06 drive -> END OF HALF -> HALFTIME -> CPU second-half drive. 207 tests.
  - [ ] 6b. Clock smarts: end-of-half field goal if in range, Q4 hurry-up when behind / milking the clock when ahead, a 1000-drive balance test.
- [ ] 7. End-of-game screen with final score and basic stats; overtime
- [ ] 8. Save mid-game, with a save migration so stage 1 saves still load

### Next up (start of next session)
0. **Step 6a phone test**, then 6b (clock smarts), then fumbles (below; decided 2026-11-18 to do them after step 6 because turnovers only matter once the opponent drives).
1. **Fumbles (user asked 2026-11-18): show this plan and wait for approval.** There are no fumbles yet; the user pointed out that avoiding contact is half the point of diving. Draft plan:
   - When our ball carrier (runner, receiver after the catch, scrambling QB) is **tackled**, a small seeded chance he fumbles (~2-3%), higher on a big hit (fast chaser) and on a strip sack. **Diving, sliding and going out of bounds can never fumble** (that's the reward for avoiding contact).
   - Recovery: a quick roll weighted toward whichever side has more players near the ball. They recover = **FUMBLE! · LOST** (their ball at the spot, `oppStartX`, like a turnover on downs); we recover = **FUMBLE! · RECOVERED** (play ends there, next down). No scooping and running it back at first.
   - Their returners (interception and punt returns) can fumble too (we'd recover = our ball).
   - Pure logic in a new `src/sim/fumble.ts` (tested), `applyFumble` in `drive.ts`, values in a new `feel.fumble` group. Stage 3: ball security rating and weather (rain/snow) scale the chance.
2. Step 5b reference (done). Original plan:
   - **PUNT** button on the play-call screen on 4th down only (not on a try). Same one-tap meter (`kicking.ts` style); punter 15 yd behind the line. Centre tap ~50 yd, edge of green ~38 yd, red = **SHANK!** (20-30 yd, slices toward a sideline). Camera follows the ball, short roll after landing. End zone = **TOUCHBACK** (their 20); out of bounds = spot where it went out; else where it stops (no returns yet). Stops inside their 20 = **INSIDE THE 20!** banner. ~6 game seconds off the clock. New `feel.punting` group.
   - **4th down:** EXECUTE PLAY (go for it) / PUNT / FIELD GOAL (only in range) side by side, plus a one-line **coach tip** from simple rules (distance to go, field position, score, time left), e.g. "4th & 1 at their 38: go for it", "Down 6 with 0:40 left: go for it". Pure logic in a new `src/sim/fourthDown.ts` (tested). Advice only.
   - Rules in `drive.ts`: punt result -> `oppStartX`; our next drive still starts at our 25 until step 6. No punt returns / blocked punts.
   - FIELD GOAL stays on ANY down when in range (decided 2026-11-17).
3. After step 5: step 6 (simulated opponent drives), 7 (end-of-game screen, overtime), 8 (mid-game save + migration).
4. Parked: downfield blocking by free teammates (option B from 2026-11-17, best with blocking ratings in Stage 3), defense adapting to repeated plays, QB slide, throw on the run, blockers moving on a scramble, receivers blocking on run plays, a fullback, option plays, a manual handoff / fake handoff. Design images are saved locally in `design-refs/` (git-ignored because they contain real NFL logos; use layout/style only, never those logos or names).

### How to test (for Claude)
- Unit tests: `npm test` from **PowerShell** (not Git Bash). Typecheck: `npm run typecheck`. Build: `npm run build`.
- Browser checks: `npm run dev` (port 5173, or 5174 if busy), then drive the game with `playwright-core` + the installed Chrome (`channel: 'chrome'`) from a script in the session scratchpad (never add Playwright to the project). In dev, `window.__game.scene.keys.field` exposes the scene state (`state`, `routeIndex`) for scripts.
- Phone: push to `main`, wait ~1 min for the deploy, reopen the app. The ⚙ panel header shows the build time.

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
- **2026-11-14: App auto-updates.** `registerSW` in `main.ts` checks for a new version on launch and whenever the app returns to the foreground, then reloads onto it (iPhone home-screen apps resume instead of restarting, so they were stuck on old versions). The ⚙ panel header shows the build time to confirm which version is running.
- **2026-11-14: Camera zoomed in 1.5x** (`camera.zoomScale`); the whole field fit on screen and players were tiny dots. Camera now follows up/down as well as along the field.
- **2026-11-14: Problem fixed: screen shake was massive.** Phaser multiplies shake intensity by camera zoom twice; with our ~10px-per-yard zoom every shake moved the screen hundreds of pixels. All shakes now go through `shakeScreen()` in `FieldScene.ts`, which divides by zoom². Never call `cameras.main.shake` directly.
- **2026-11-14: Problem fixed: cornerback contested almost every pass** (he sprinted to the landing spot at full speed). He now breaks on the ball at `cbBallSpeedRatio` 0.6; balance test checks an on-time slant is caught 60%+.
- **2026-11-14: Catch rules.** Ball thrown straight to a defender: INTERCEPTED (75%) or LUCKY! (he drops it), never "incomplete". Open receivers drop 5% (DROPPED). Catches/picks with the catcher's centre point out of bounds are INCOMPLETE. All chances are sliders until hands ratings exist (stage 3).
- **2026-11-14: Placeholder rules to replace with ratings in stage 3:** juke burst / miss chance / recovery (agility, acceleration), receiver and defender catch chances, rusher shed time (pass rush vs O-line), receiver/runner speed, QB ball speed (arm strength), broken-tackle chance (strength / "fights for extra yards").
- **2026-11-14: User wants to draw their own routes.** Hot routes go in step 3; a full **play designer** (drag out routes, name and save plays to the playbook, save migration) comes later: end of Stage 2 or with tactics/coordinators in Stage 8.
- **2026-11-15: Camera zoom 1.5 -> 1.2** (`camera.zoomScale`): on the phone it showed only about half the field width. If a phone still looks zoomed in, an old slider value may be saved: ⚙ -> Reset.
- **2026-11-15: Port 5173 may be taken by the user's HooMaps dev server.** Use another port (e.g. `npm run dev -- --port 5180 --strictPort`) for browser tests, and never stop the HooMaps server.
- **2026-11-15: Step 3 plan approved:** 3a = play calling screen (HTML/CSS overlay in the UI-kit style, Press Start 2P font self-hosted via @fontsource, opens before every play with the last play preselected; EXECUTE / AUDIBLE / CANCEL / TEAM (greyed); no player form card until stage 3). 3b = hot routes via AUDIBLE (tap a receiver on the diagram to cycle routes), Hitch/Curl stop routes, 2 more plays (6 total). Run plays later, once there's a running back.
- **2026-11-14: Skipping is a SKIP button only** (user kept skipping returns/results by tapping out of habit). Supersedes "tap to skip" in the feel notes.
- **2026-11-14: Parked ideas:** downfield blocking by receivers after a catch; throwing-zone glow hint with an off switch; ~~interception returns~~ (built in Stage 2 step 2c); QB scrambling; kick returns (maybe later, per the feel notes).
- **2026-11-14: Dev workflow notes.** Git Bash heredocs break on Python code with nested quotes, so write multi-line edit scripts to the scratchpad and run them from there. A dev-only `window.__game` hook in `main.ts` lets browser test scripts read game state (excluded from production builds).
- **2026-11-14: Design images contain real NFL material** (Bills/Giants logos, AFC, BUF/NYG, "Retro Bowl Championship"). Use their layouts and style only; replace all names/logos with our fictional league. Images kept in git-ignored `design-refs/`.
- **2026-11-14: Auto-update stays as is** (reloads straight away, even mid-game). User is the only player and prefers it simple.
- **2026-11-14: The play-call mockup and UI kit exist only as images** (no source files). When building step 2, ask the user to paste/attach the images and build the screen from them in code.
- **2026-11-14: Stage 2 plan approved. Quarters are 2 minutes of game clock** (user's choice). How the clock runs between plays gets decided in step 4.
- **2026-11-14: Stage 1 complete.** Everything tested on PC and phone: throwing, routes, defense, catches/picks, running, jukes, tackles. 67 unit tests passing. Next: Stage 2 (see "Next up").
- **2026-11-16: Checkpoint.** Tracker reviewed: Stage 1 done, Stage 2 steps 1–2d done, 3a built and waiting for the user's phone test, then 3b. Problem noted: two chats edited the project at the same time (an older chat's dev server died while a newer chat carried on). Work in **one chat at a time** and start each new chat with "Read CLAUDE.md and check the latest git commits".
- **2026-11-16: Problem fixed: field zoomed way in, QB off screen on the phone.** Opening the app while holding the phone upright, then rotating, left the game thinking the screen was still upright (only ~23 yd visible): the game is asleep during the rotate screen and missed the resize. `applyOrientation` in `main.ts` now calls `game.scale.refresh()` on wake and again 300ms later. Test with Playwright: start at 390x844, resize to 844x390, check `cam.worldView.width` is ~107.
- **2026-11-16: Stop routes needed two new coverage rules** (balance test showed an on-time hitch caught only 38%: the corner ran onto the planted receiver). (1) A defender can't get closer than `defense.cbBodyGapYards` (0.8) to the receiver, before or after the throw (`bodyGapYards` in `stepCoverage`); this also stops corners hiding stopped receivers on screen. (2) A defender further from the QB than the receiver is "shielded" and contests at `defense.shieldedContestRatio` (0.5) strength (`isShielded`, `resolvePass(..., thrower)`). Result: on-time hitch ~76%, early hitch ~53%, curl 56-76%, slant unchanged 95%. Tried and dropped: a minimum cushion (made go routes much tighter) and a plant-and-drive slowdown (barely helped).
- **2026-11-16: QB scramble built (step 3c).** Aim behind the QB (slingshot: drag forward) = green RUN arrow; release to run. First version made every scramble an instant sack (blockers stopped blocking); fixed by keeping each rusher held until his own shed time. Browser check: unsteered scramble ~3 yd, late scramble can be sacked. 115 tests passing. Still needs the user's phone test.
- **2026-11-16: User asked for a running back.** Decided: new step 3d, before the clock (user approved).
- **2026-11-17: Running back built (step 3d).** Balance is judged two ways in `run.test.ts`: a headless runner who jukes the first tackler (should average 3-6 yd) and one who never jukes (must gain clearly less and get stuffed sometimes), so jukes matter. Problems found and fixed while tuning: (1) blockers pushed defenders straight downfield, into the RB's lane: now they push back AND away from the runner; (2) the unblocked linebacker met the RB at the line every time: he now waits `lbReadTime` 0.4s after the handoff and holds 5 yd deep (`lbFloorYards`); (3) Toss was better than Dive in every way: narrowed it and the bottom receiver runs a Hitch (stays near the edge); (4) the checkdown gained 0 yd: the linebacker now drops to 8 yd on pass plays and the Flat route angles upfield instead of running into the bottom corner's area. The RB uses `runGame.rbRunSpeed` (7) whenever he has the ball, including after a catch.
- **2026-11-17: Problem fixed: one move = guaranteed big play** (user feedback after 3d). Chasers were slower than ball carriers (DBs 7.2 vs WR 7.5 / RB 7) and jukes were free. Now: `dbPursuitSpeed` 7.9, `lbPursuitSpeed` 6.8, a juke costs speed (`running.jukeForwardRatio` 0.8, back to full over `jukeRecoverTime` 0.2s), juked defender down for `stunTime` 0.55s (was 0.7). Tried half speed during a juke: made juking useless. Balance tests now check: a few yards on average, under 8% of runs go 10+ yd, juking avoids most stuffs. Note the headless bot jukes blindly and never looks for open space, so real players gain more than its numbers.
- **2026-11-17: Juking should depend on player ratings** (user). Stage 3: agility -> juke burst and miss chance, acceleration -> juke recovery, speed -> run speed, defender tackling/pursuit -> stumble time and chase speed. Add to the stage-3 placeholder list.
- **2026-11-17: Parked idea (user asked): the defense adapts.** Right now it plays the same man coverage every snap; only the dice change. Idea: if you keep calling the same play or keep running, the defense starts sitting on it (linebacker creeps up, corners jump routes). Fits Stage 2 step 6 or the game-plan/tendency work in Stage 8.
- **2026-11-17: Problem fixed: teammates without the ball ran off to the right.** After a catch/handoff they kept running their routes (and past the route's end, straight on), so everyone drifted downfield. Chose option A (pull up, then jog after the play behind the carrier) over B (downfield blocking, parked: changes balance, wants blocking ratings).
- **2026-11-17: Step 4 (clock) plan shown** (see Next up). User asked to do the 3e fixes first.
- **2026-11-17: Dev note.** An old retro-football dev server from an earlier chat was still running on port 5180 (serving this folder, so it works for browser checks). Vitest hides `console.log` from passing tests here; for tuning experiments, throw an Error with the results in a temporary `*.tmp.test.ts` file (deleted afterwards), or use `src/sim/runSim.ts`.
- **2026-11-17: TIMEOUT lives on the play-call screen** (user feedback): a field button before the snap made no sense, since the play-call screen opens after every play anyway. TIMEOUT (n) sits next to CANCEL, lights up only while the clock is running (after a tackle in bounds) and saves the huddle runoff. The field TIMEOUT button is gone.
- **2026-11-17: Going down on your own = flick forward** (user: a gesture is more intuitive than a button). Dive length 1-3 yd depends on running speed, so timing matters; in Stage 3 it can use ratings.
- **2026-11-17: Dev note: never rewrite files with PowerShell `Get-Content`/`Set-Content`.** Windows PowerShell 5.1 reads UTF-8 as ANSI and adds a BOM, which corrupted the special characters in `FieldScene.ts` (`·`, `⚙`, `…`). Edit with the Edit tool or Python (`encoding='utf-8'`).
- **2026-11-17: Kick meter difficulty should come from the kicker's ratings** (user, Stage 3): kicking accuracy -> green zone size, kicking power -> max range (`feel.kicking.maxRangeYards`), composure / big-game -> meter speed under pressure. Same for punting.
- **2026-11-17: Goal-line routes fixed** (user phone test of 5a). Routes ran 40 yd past the back of the end zone near their goal line. `routePath` now caps every point at `ROUTE_MAX_X` (1.5 yd inside the end line: a Go becomes "run to the back line", a Post flattens along it) and `stepRunner` stops receivers at the end line. Play-call diagrams slide back so they end just past the end line, drawn with the end line, goalposts and out-of-bounds colour. **Stop routes (Hitch, Curl, Check) are drawn with a flat bar at the turn** (playbook "stop" symbol) instead of an arrowhead: the 1-yd comeback was shorter than the arrowhead and drew a notch. Arrowheads are never longer than the route's last leg.
- **2026-11-17: Checkpoint (end of session).** Done today: 3e (tuning + teammates) and 3f (dive) phone tested, step 4 (clock, quarters, timeouts, 30-second warning) phone tested. Stage 2 steps 5-8 remain. 145 tests passing. The step 5 plan is written in Next up.
- **2026-11-18: Punt return tuning.** First try: coverage was 11-23 yd away when the ball came down (arcade hang time ~1.8s vs ~4.5s in real football, and real gunners leave at the snap), so no fair catches. Fixed the arcade way: hang 2.8s, gunners 10 yd/s, the returner fair-catches with coverage within 12-20 yd (not right on him), and their blockers create the variety (big returns). Longer punts (60 yd from the punter, ~45 past the line) so a good punt still nets 30+ yd after the return. A centred punt outkicks the coverage more (fewer fair catches, longer returns) but still nets the most. Muffs are always recovered by us (simplification).
- **2026-11-18: Parked idea (user): special teams SIM / CONTROL switch.** Later, let the user choose to watch special teams (auto, current) or take control (e.g. steer a gunner on punt coverage, maybe return kicks). Fits with "defense and kicking mostly simulated, optional light interaction".
- **2026-11-18: Checkpoint (end of session 3).** Done: step 5b (punts, 4th-down coach tip) and 5c (punt returns: returner, automatic coverage, their blockers, fair catch, muffs, return TDs), both phone tested. 188 tests passing. Problems met: (1) Git Bash heredocs holding Python scripts failed ("unexpected EOF"): write scripts with the Write tool into the scratchpad, then `python <path>`; (2) at 667px wide the 4th-down buttons wrapped onto two lines: fixed with the short "FG (n YD)" label on 4th down, `white-space: nowrap` and smaller padding under 720px; (3) the kick meter covered the field during a return: it now hides as soon as the ball comes down. User asked about **fumbles** (none exist yet); plan drafted in Next up. Remaining in Stage 2: fumbles (new, if approved), steps 6, 7, 8.
- **2026-11-19: CPU drive summary waits for CONTINUE** (user phone test of 6a: the 3.5s auto-advance was too quick to read). No timer at all; `feel.oppDrive.summaryTime` removed.
- **2026-11-17: Checkpoint (end of session 2).** Done: step 5a (field goals, extra points, 2-pt try; one-tap kick meter) phone tested; goal-line route fix and the stop-route bar phone tested ("looks good"). Problems met this session: (1) a Git Bash command with a stray `cat >` sat waiting for input until it timed out: write edit scripts to the scratchpad and run them, never chain a bare `cat >`; (2) `npx prettier --write` reformatted a whole file in the wrong style (double quotes, short lines): the project has **no Prettier config**, so never run Prettier; keep the existing style (single quotes, ~140-char lines) by hand. Next: 5b plan approval, then steps 6-8. 160 tests passing.
