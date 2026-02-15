import type Phaser from "phaser";

export type CardType = "cannon_tower" | "fireball" | "spike_trap" | "goo_tower" | "goo_ball";
export type GamePhase = "player_action" | "enemy_step" | "victory" | "defeat";
export type EnemyType = "goblin" | "orc" | "gargoyle";
export type TowerKind = "cannon" | "goo";

export interface Hex {
  q: number;
  r: number;
}

export interface HexLayout {
  size: number;
  originX: number;
  originY: number;
}

export interface CardDefinition {
  type: CardType;
  name: string;
  timestepCost: number;
  artKey: string;
}

export interface CardInstance extends CardDefinition {
  id: number;
}

export interface DeckState {
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  handLimit: number;
}

export interface WaveState {
  waveIndex: number;
  totalWaves: number;
  spawnedInWave: number;
}

export interface EnemyArchetype {
  type: EnemyType;
  name: string;
  maxHp: number;
  moveTilesPerStep: number;
  textureKey: string;
  isFlying: boolean;
}

export interface TurnState {
  turnNumber: number;
  pendingEnemySubsteps: number;
  actionTaken: boolean;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  name: string;
  isFlying: boolean;
  moveTilesPerStep: number;
  pathIndex: number;
  hp: number;
  maxHp: number;
  slowStacks: number;
  alive: boolean;
  spriteScale: number;
  sprite: Phaser.GameObjects.Image;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  hex: Hex;
  rangeHex: number;
  damage: number;
  fireIntervalTimesteps: number;
  nextFireTimestep: number;
  sprite: Phaser.GameObjects.Image;
}

export interface Trap {
  id: number;
  hex: Hex;
  damage: number;
  sprite: Phaser.GameObjects.Triangle;
}

export interface HandCardView {
  cardId: number;
  container: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Image;
  hitZone: Phaser.GameObjects.Zone;
}
