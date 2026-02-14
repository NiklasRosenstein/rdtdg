import { CardDefinition, CardType, EnemyArchetype, EnemyType } from "./types";

export const GAME_WIDTH = 1000;
export const GAME_HEIGHT = 720;

export const HAND_PANEL_HEIGHT = 180;
export const BOARD_CENTER_Y = 250;

export const HEX_SIZE = 30;
export const GRID_Q_MIN = 0;
export const GRID_Q_MAX = 11;
export const GRID_R_MIN = -2;
export const GRID_R_MAX = 3;

export const START_LIVES = 3;

export const START_HAND_DRAW = 5;
export const HAND_LIMIT = 7;
export const DRAW_ACTION_COUNT = 2;
export const DRAW_ACTION_TIMESTEPS = 1;

export const TOTAL_WAVES = 5;
export const WAVE_SPAWN_COUNTS = [4, 6, 8, 10, 12];
export const ENEMY_STEP_SPEED_MULTIPLIER = 3;

export const ENEMY_ARCHETYPES: Record<EnemyType, EnemyArchetype> = {
  goblin: {
    type: "goblin",
    name: "Goblin",
    maxHp: 6,
    moveTilesPerStep: 1,
    textureKey: "enemy_goblin",
    isFlying: false
  },
  orc: {
    type: "orc",
    name: "Orc",
    maxHp: 10,
    moveTilesPerStep: 1,
    textureKey: "enemy_orc",
    isFlying: false
  },
  gargoyle: {
    type: "gargoyle",
    name: "Gargoyle",
    maxHp: 4,
    moveTilesPerStep: 2,
    textureKey: "enemy_gargoyle",
    isFlying: true
  }
};

export const CANNON_RANGE_HEX = 2;
export const CANNON_DAMAGE = 1;
export const CANNON_FIRE_INTERVAL_TIMESTEPS = 1;

export const GOO_TOWER_RANGE_HEX = 2;
export const GOO_TOWER_FIRE_INTERVAL_TIMESTEPS = 2;
export const GOO_SLOW_STACKS_PER_APPLICATION = 1;

export const FIREBALL_DAMAGE = 2;
export const FIREBALL_RADIUS_HEX = 1;

export const SPIKE_DAMAGE = 1;

export const CARD_DEFINITIONS: Record<CardType, CardDefinition> = {
  cannon_tower: {
    type: "cannon_tower",
    name: "Cannon Tower",
    timestepCost: 1,
    artKey: "card_cannon"
  },
  fireball: {
    type: "fireball",
    name: "Fireball",
    timestepCost: 2,
    artKey: "card_fireball"
  },
  spike_trap: {
    type: "spike_trap",
    name: "Spike Trap",
    timestepCost: 1,
    artKey: "card_spike"
  },
  goo_tower: {
    type: "goo_tower",
    name: "Goo Tower",
    timestepCost: 2,
    artKey: "card_goo_tower"
  },
  goo_ball: {
    type: "goo_ball",
    name: "Goo Ball",
    timestepCost: 3,
    artKey: "card_goo_ball"
  }
};

export const STARTING_DECK_COMPOSITION: Record<CardType, number> = {
  cannon_tower: 3,
  fireball: 3,
  spike_trap: 3,
  goo_tower: 1,
  goo_ball: 1
};
