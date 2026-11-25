/** Small deterministic noise helpers for the procedural visuals. No dependencies. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERM_SIZE = 256;

export interface Noise2D {
  (x: number, y: number): number;
}

/** Value noise in [0, 1] with smooth interpolation. */
export function createValueNoise(seed = 7): Noise2D {
  const rand = mulberry32(seed);
  const values = new Float32Array(PERM_SIZE * PERM_SIZE);
  for (let i = 0; i < values.length; i++) values[i] = rand();
  const at = (ix: number, iy: number) => values[((iy & 255) << 8) | (ix & 255)] ?? 0;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Fractal sum of value noise, normalized to [0, 1]. */
export function fbm(noise: Noise2D, x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
