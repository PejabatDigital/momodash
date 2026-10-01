# Momo's Temple Dash

Live at **https://momodash.kasahkod.cc**

A 3D endless runner for the browser. Momo the monkey runs through a jungle temple, jumping logs, sliding under stone beams, and dodging walls while collecting bananas.

## Features

- Two levels: Beginner (steady slow speed) and Normal (speeds up over time)
- 5 lives, with a "Get ready, 3-2-1, go!" countdown at the start and after each hit
- Combo multiplier up to x4 for collecting bananas in a row
- Vine swing special move, magnet and shield power-ups
- Arcade-style high score boards (top 6 per level, 4-letter names), saved per device
- Global leaderboard (top 10 per level) backed by a small Cloudflare Worker + D1 database, shown alongside the local board
- Cartoon graphics with shadows, outlines, particles, and automatic quality scaling
- Touch (swipe) and keyboard controls, sound effects with mute

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Change lane | Swipe left / right | Left / Right or A / D |
| Jump | Swipe up | Up, W or Space |
| Slide | Swipe down | Down or S |
| Vine swing (when meter is full) | Tap the meter | E |
| Pause | Pause button | P or Esc |

## Project structure

```
index.html         Page markup (start screen, HUD, panels)
css/style.css      All styling
js/game.js         Game logic, 3D scene, audio, input
worker/index.js    Cloudflare Worker: serves the static site and the /api/* leaderboard routes
worker/schema.sql  D1 table definition for the global leaderboard
wrangler.toml      Worker config (static assets binding + D1 binding)
favicon.ico        Browser tab icon
site.webmanifest   Home-screen app metadata (name, icons, theme color)
icons/             Favicons, home-screen icon, and the link-share thumbnail
```

The game itself has no build step — Three.js (r128) and the Google Fonts load from CDNs, so an internet connection is needed on first load. The only tooling is Wrangler, used to run/deploy the Worker that serves the site and the leaderboard API.

## Running locally

Open `index.html` directly in a browser for the game alone (global leaderboard calls will just fail silently). For the full experience including the API:

```bash
npm install
npm run dev   # wrangler dev, serves the site + /api/* with a local D1 instance
```

## Global leaderboard (Cloudflare D1)

One-time setup for a new environment:

```bash
wrangler d1 create momo-dash-leaderboard   # copy the database_id into wrangler.toml
npm run db:migrate                         # creates the scores table locally
npm run db:migrate:remote                  # creates the scores table in production
```

The Worker exposes:
- `GET /api/leaderboard?level=beginner|normal` — top 10 scores for that level
- `POST /api/scores` — `{ level, name, score }`, called when a run qualifies for the local high score board

Personal best stays local-only (`localStorage`, unchanged); only the global top-10 boards are server-backed.

## Deploying

Live at **https://momodash.kasahkod.cc**

Hosted on Cloudflare Workers, deployed automatically from the `main` branch via the GitHub integration (Workers Builds), which picks up `wrangler.toml` to build the Worker with its static assets and D1 binding. Double-check in the Cloudflare dashboard after the first deploy with these changes that the build is using `wrangler.toml` rather than the old plain-static auto-detection.

## Tuning

Most gameplay values sit near the top of `js/game.js`:

- `LEVELS` for each level's speed and difficulty cap
- `START_SPEED`, `MAX_SPEED`, `GRAV`, `JUMP_V` for feel
- `MAX_LIVES` and `SWING_TIME`
- `multFor()` for combo multiplier thresholds

High scores, best scores, the last name entered, the chosen level, and the mute setting are stored in the browser's `localStorage` under keys starting with `momo-temple-`.
