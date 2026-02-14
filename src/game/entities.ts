import Phaser from "phaser";

import { Enemy, EnemyArchetype, Hex, Tower, TowerKind, Trap } from "./types";

const HP_BAR_WIDTH = 20;

export function createEnemy(scene: Phaser.Scene, id: number, archetype: EnemyArchetype, x: number, y: number): Enemy {
  const sprite = scene.add.image(x, y, archetype.textureKey);
  const maxW = 40;
  const maxH = 40;
  const fitScale = Math.min(maxW / sprite.width, maxH / sprite.height);
  sprite.setScale(fitScale);
  sprite.setDepth(30);

  const hpBg = scene.add.rectangle(x, y - 15, HP_BAR_WIDTH, 4, 0x111827);
  hpBg.setOrigin(0.5, 0.5);
  hpBg.setDepth(40);

  const hpFill = scene.add.rectangle(x - HP_BAR_WIDTH / 2, y - 15, HP_BAR_WIDTH, 4, 0x22c55e);
  hpFill.setOrigin(0, 0.5);
  hpFill.setDepth(41);

  return {
    id,
    type: archetype.type,
    name: archetype.name,
    isFlying: archetype.isFlying,
    moveTilesPerStep: archetype.moveTilesPerStep,
    pathIndex: 0,
    hp: archetype.maxHp,
    maxHp: archetype.maxHp,
    slowStacks: 0,
    alive: true,
    spriteScale: fitScale,
    sprite,
    hpBg,
    hpFill
  };
}

export function setEnemyPosition(enemy: Enemy, x: number, y: number): void {
  const flyingOffset = enemy.isFlying ? -10 : 0;
  enemy.sprite.setPosition(x, y + flyingOffset);
  enemy.hpBg.setPosition(x, y - 15 + flyingOffset);
  enemy.hpFill.setPosition(x - HP_BAR_WIDTH / 2, y - 15 + flyingOffset);
}

export function syncEnemyHealthBar(enemy: Enemy): void {
  const ratio = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
  enemy.hpFill.width = HP_BAR_WIDTH * ratio;
}

export function destroyEnemy(enemy: Enemy): void {
  enemy.sprite.destroy();
  enemy.hpBg.destroy();
  enemy.hpFill.destroy();
}

export function createTower(
  scene: Phaser.Scene,
  id: number,
  kind: TowerKind,
  hex: Hex,
  x: number,
  y: number,
  rangeHex: number,
  damage: number,
  fireIntervalTimesteps: number,
  nextFireTimestep: number
): Tower {
  const fillColor = kind === "goo" ? 0x10b981 : 0xf59e0b;
  const strokeColor = kind === "goo" ? 0x064e3b : 0x78350f;
  const sprite = scene.add.circle(x, y, 12, fillColor);
  sprite.setStrokeStyle(2, strokeColor);
  sprite.setDepth(20);

  return {
    id,
    kind,
    hex,
    rangeHex,
    damage,
    fireIntervalTimesteps,
    nextFireTimestep,
    sprite
  };
}

export function destroyTower(tower: Tower): void {
  tower.sprite.destroy();
}

export function createTrap(scene: Phaser.Scene, id: number, hex: Hex, x: number, y: number, damage: number): Trap {
  const sprite = scene.add.triangle(x, y, 0, 14, 10, -8, 20, 14, 0xef4444);
  sprite.setStrokeStyle(2, 0x7f1d1d);
  sprite.setDepth(25);

  return {
    id,
    hex,
    damage,
    sprite
  };
}

export function destroyTrap(trap: Trap): void {
  trap.sprite.destroy();
}
