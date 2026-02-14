import { GRID_Q_MAX, GRID_Q_MIN, GRID_R_MAX, GRID_R_MIN } from "./config";
import { hexKey } from "./hex";
import { Hex } from "./types";

export const PATH_HEXES: Hex[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: 3, r: 0 },
  { q: 4, r: 0 },
  { q: 5, r: 0 },
  { q: 6, r: 0 },
  { q: 6, r: 1 },
  { q: 5, r: 1 },
  { q: 4, r: 1 },
  { q: 3, r: 1 },
  { q: 2, r: 1 },
  { q: 2, r: 2 },
  { q: 3, r: 2 },
  { q: 4, r: 2 },
  { q: 5, r: 2 },
  { q: 6, r: 2 },
  { q: 7, r: 2 },
  { q: 8, r: 2 },
  { q: 9, r: 2 },
  { q: 10, r: 2 },
  { q: 11, r: 2 }
];

export const START_HEX = PATH_HEXES[0];
export const BASE_HEX = PATH_HEXES[PATH_HEXES.length - 1];

export function createMapHexes(): Hex[] {
  const cells: Hex[] = [];

  for (let q = GRID_Q_MIN; q <= GRID_Q_MAX; q += 1) {
    for (let r = GRID_R_MIN; r <= GRID_R_MAX; r += 1) {
      cells.push({ q, r });
    }
  }

  return cells;
}

export function createPathHexKeySet(): Set<string> {
  const keys = new Set<string>();
  for (const hex of PATH_HEXES) {
    keys.add(hexKey(hex));
  }
  return keys;
}

export function createBuildableHexKeySet(mapHexes: Hex[], pathHexKeys: Set<string>): Set<string> {
  const keys = new Set<string>();
  for (const hex of mapHexes) {
    const key = hexKey(hex);
    if (!pathHexKeys.has(key)) {
      keys.add(key);
    }
  }
  return keys;
}

export function isInsideMap(hex: Hex): boolean {
  return hex.q >= GRID_Q_MIN && hex.q <= GRID_Q_MAX && hex.r >= GRID_R_MIN && hex.r <= GRID_R_MAX;
}
