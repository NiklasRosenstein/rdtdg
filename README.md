# Roguelite Deckbuilder Tower Defense (Phaser + TypeScript)

Turn-based hex-grid tower defense prototype with deckbuilder mechanics.

## Run

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## MVP Rules

- One action per turn: play one card OR use `Draw 2` button.
- Then enemies advance by timesteps:
- Card play: enemies advance by that card's timestep cost.
- Draw 2: enemies advance by 1 timestep.
- Survive 5 waves to win.
- You start with 3 lives. Enemy reaching the end costs 1 life.

## Cards

- `Cannon Tower` (`assets/cannon_tower.webp`): place on buildable hex, enemy +1 step.
- `Fireball` (`assets/fireball_spell.webp`): cast on enemy hex, small AoE damage, enemy +2 steps.
- `Spike Trap` (`assets/spike_trap.webp`): place on path hex, persistent step damage, enemy +1 step.

## Controls

- Click a card in your hand to select it.
- Click a valid hex target to play the selected card.
- Click `Draw 2 (Enemy +1 Step)` for draw action.
- Press `R` after victory/defeat to restart.
