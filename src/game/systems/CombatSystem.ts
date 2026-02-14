import { hexDistance, hexKey } from "../hex";
import { Enemy, Hex, Tower, Trap } from "../types";

export interface FireballHit {
  enemy: Enemy;
  damage: number;
}

export interface TrapHit {
  trap: Trap;
  enemy: Enemy;
  damage: number;
}

export interface TowerShot {
  kind: "cannon";
  tower: Tower;
  target: Enemy;
  damage: number;
}

export interface GooShot {
  kind: "goo";
  tower: Tower;
  targetHex: Hex;
  affectedEnemies: Enemy[];
  slowApplied: number;
}

export type TowerAttack = TowerShot | GooShot;

export class CombatSystem {
  applyFireball(enemies: Enemy[], path: Hex[], targetHex: Hex, radius: number, damage: number): FireballHit[] {
    const hits: FireballHit[] = [];

    for (const enemy of enemies) {
      if (!enemy.alive) {
        continue;
      }

      const enemyHex = getEnemyHex(enemy, path);
      if (hexDistance(enemyHex, targetHex) <= radius) {
        this.applyDamage(enemy, damage);
        hits.push({ enemy, damage });
      }
    }

    return hits;
  }

  applyGlobalSlow(enemies: Enemy[], slowStacks: number): Enemy[] {
    if (slowStacks <= 0) {
      return [];
    }

    const affected: Enemy[] = [];
    for (const enemy of enemies) {
      if (!enemy.alive) {
        continue;
      }
      enemy.slowStacks += slowStacks;
      affected.push(enemy);
    }
    return affected;
  }

  resolveTraps(enemies: Enemy[], traps: Trap[], path: Hex[], hitThisTimestep?: Set<string>): TrapHit[] {
    const trapByHexKey = new Map<string, Trap>();
    for (const trap of traps) {
      trapByHexKey.set(hexKey(trap.hex), trap);
    }

    const hits: TrapHit[] = [];

    for (const enemy of enemies) {
      if (!enemy.alive) {
        continue;
      }
      if (enemy.isFlying) {
        continue;
      }

      const hex = getEnemyHex(enemy, path);
      const trap = trapByHexKey.get(hexKey(hex));
      if (trap) {
        const pairKey = `${trap.id}:${enemy.id}`;
        if (hitThisTimestep?.has(pairKey)) {
          continue;
        }

        hitThisTimestep?.add(pairKey);
        this.applyDamage(enemy, trap.damage);
        hits.push({ trap, enemy, damage: trap.damage });
      }
    }

    return hits;
  }

  resolveTowers(enemies: Enemy[], towers: Tower[], path: Hex[], currentTimestep: number, gooSlowStacks: number): TowerAttack[] {
    const shots: TowerAttack[] = [];

    for (const tower of towers) {
      if (currentTimestep < tower.nextFireTimestep) {
        continue;
      }

      let best: Enemy | null = null;

      for (const enemy of enemies) {
        if (!enemy.alive) {
          continue;
        }

        const enemyHex = getEnemyHex(enemy, path);
        if (hexDistance(tower.hex, enemyHex) > tower.rangeHex) {
          continue;
        }

        if (!best || enemy.pathIndex > best.pathIndex || (enemy.pathIndex === best.pathIndex && enemy.hp < best.hp)) {
          best = enemy;
        }
      }

      if (!best) {
        continue;
      }

      if (tower.kind === "goo") {
        const targetHex = getEnemyHex(best, path);
        const affectedEnemies = this.applySlowOnHex(enemies, path, targetHex, gooSlowStacks);
        shots.push({
          kind: "goo",
          tower,
          targetHex: { ...targetHex },
          affectedEnemies,
          slowApplied: gooSlowStacks
        });
      } else {
        this.applyDamage(best, tower.damage);
        shots.push({ kind: "cannon", tower, target: best, damage: tower.damage });
      }

      tower.nextFireTimestep = currentTimestep + tower.fireIntervalTimesteps;
    }

    return shots;
  }

  private applyDamage(enemy: Enemy, amount: number): void {
    enemy.hp -= amount;
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
    }
  }

  private applySlowOnHex(enemies: Enemy[], path: Hex[], targetHex: Hex, slowStacks: number): Enemy[] {
    if (slowStacks <= 0) {
      return [];
    }

    const affected: Enemy[] = [];
    for (const enemy of enemies) {
      if (!enemy.alive) {
        continue;
      }
      const enemyHex = getEnemyHex(enemy, path);
      if (enemyHex.q !== targetHex.q || enemyHex.r !== targetHex.r) {
        continue;
      }
      enemy.slowStacks += slowStacks;
      affected.push(enemy);
    }
    return affected;
  }
}

function getEnemyHex(enemy: Enemy, path: Hex[]): Hex {
  const clamped = Math.max(0, Math.min(path.length - 1, enemy.pathIndex));
  return path[clamped];
}
