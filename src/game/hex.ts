import { Hex, HexLayout } from "./types";

const SQRT3 = Math.sqrt(3);

export function hexKey(hex: Hex): string {
  return `${hex.q},${hex.r}`;
}

export function hexDistance(a: Hex, b: Hex): number {
  const aq = a.q;
  const ar = a.r;
  const as = -aq - ar;

  const bq = b.q;
  const br = b.r;
  const bs = -bq - br;

  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(as - bs)) / 2;
}

export function hexToPixel(hex: Hex, layout: HexLayout): { x: number; y: number } {
  const x = layout.size * SQRT3 * (hex.q + hex.r / 2) + layout.originX;
  const y = layout.size * 1.5 * hex.r + layout.originY;
  return { x, y };
}

export function pixelToHex(x: number, y: number, layout: HexLayout): Hex {
  const localX = x - layout.originX;
  const localY = y - layout.originY;

  const q = (SQRT3 / 3 * localX - (1 / 3) * localY) / layout.size;
  const r = ((2 / 3) * localY) / layout.size;

  return roundAxial({ q, r });
}

export function hexCorners(hex: Hex, layout: HexLayout): Array<{ x: number; y: number }> {
  const center = hexToPixel(hex, layout);
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < 6; i += 1) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    points.push({
      x: center.x + layout.size * Math.cos(angle),
      y: center.y + layout.size * Math.sin(angle)
    });
  }

  return points;
}

function roundAxial(hex: { q: number; r: number }): Hex {
  const x = hex.q;
  const z = hex.r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}
