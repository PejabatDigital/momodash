# Momo's Temple Dash

Live at **https://pejabatdigital.github.io/momodash**

A 3D endless runner for the browser. Momo the monkey runs through a jungle temple, jumping logs, sliding under stone beams, and dodging walls while collecting bananas.

## Features

- Two levels: Beginner (steady slow speed) and Normal (speeds up over time)
- 5 lives, with a "Get ready, 3-2-1, go!" countdown at the start and after each hit
- Combo multiplier up to x4 for collecting bananas in a row
- Vine swing special move, magnet and shield power-ups
- Arcade-style high score boards (top 6 per level, 4-letter names), saved per device
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
favicon.ico        Browser tab icon
site.webmanifest   Home-screen app metadata (name, icons, theme color)
icons/             Favicons, home-screen icon, and the link-share thumbnail
```

There's no build step. Three.js (r128) and the Google Fonts load from CDNs, so an internet connection is needed on first load.

## Running locally

Open `index.html` directly in a browser, or serve the folder for a smoother dev loop, for example with the VS Code **Live Server** extension, or:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Deploying

Live at **https://pejabatdigital.github.io/momodash**

Hosted on GitHub Pages, deployed from the `main` branch (Settings → Pages → Source: `main`, `/ (root)`). Plain HTML/CSS/JS, no build step.

## Tuning

Most gameplay values sit near the top of `js/game.js`:

- `LEVELS` for each level's speed and difficulty cap
- `START_SPEED`, `MAX_SPEED`, `GRAV`, `JUMP_V` for feel
- `MAX_LIVES` and `SWING_TIME`
- `multFor()` for combo multiplier thresholds

High scores, best scores, the last name entered, the chosen level, and the mute setting are stored in the browser's `localStorage` under keys starting with `momo-temple-`.
