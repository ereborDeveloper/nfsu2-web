// The radio's volume matching: modern masters are far louder than the game's EA Trax songs (about -8 LUFS), so a track of the folder is
// measured after decoding (ITU-R BS.1770: K-weighting, 400 ms blocks, gated) and brought to that level.  A louder track is turned down;
// a quieter one is turned up only as far as its peak allows (-0.3 dBFS), as the runtime clamps samples to full scale.  No limiter.

export const TARGET_LUFS = -8, PEAK_CEILING_DB = -0.3;
const SEGMENT = 4410, SEGMENTS_PER_BLOCK = 4;   // 100 ms at the mixer's 44100 Hz; a block is 400 ms
// BS.1770 K-weighting at 44100 Hz: a high shelf (+4 dB, 1.5 kHz), then a high-pass (38 Hz); [b0, b1, b2, a1, a2]
const STAGES = [
  [1.5309095946, -2.6511690324, 1.1691668584, -1.6637501101, 0.7126575310],
  [0.9946078092, -1.9892156184, 0.9946078092, -1.9892010417, 0.9892301960],
];

/** Mean square of each 100 ms of one channel after the K-weighting. */
function segments(x: Float32Array, count: number): Float64Array {
  const sums = new Float64Array(count), z = new Float64Array(4);   // the state of the two stages
  const [[a0, a1, a2, a3, a4], [b0, b1, b2, b3, b4]] = STAGES;
  for (let s = 0, i = 0; s < count; s++) {
    let sum = 0;
    for (const end = i + SEGMENT; i < end; i++) {
      const v = x[i], u = a0 * v + z[0];
      z[0] = a1 * v - a3 * u + z[1]; z[1] = a2 * v - a4 * u;
      const y = b0 * u + z[2];
      z[2] = b1 * u - b3 * y + z[3]; z[3] = b2 * u - b4 * y;
      sum += y * y;
    }
    sums[s] = sum / SEGMENT;
  }
  return sums;
}

/** Integrated loudness in LUFS, -Infinity for silence. */
export function loudness(left: Float32Array, right: Float32Array): number {
  const count = Math.floor(left.length / SEGMENT);
  if (!count) return -Infinity;
  const l = segments(left, count), r = right === left ? l : segments(right, count);
  const width = Math.min(SEGMENTS_PER_BLOCK, count), blocks: number[] = [];
  for (let b = 0; b + width <= count; b++) {
    let power = 0;
    for (let k = 0; k < width; k++) power += l[b + k] + r[b + k];
    blocks.push(power / width);
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p);
  const mean = (list: number[]) => list.reduce((a, p) => a + p, 0) / list.length;
  const loud = blocks.filter(p => lufs(p) > -70);
  if (!loud.length) return -Infinity;
  const kept = loud.filter(p => lufs(p) > lufs(mean(loud)) - 10);
  return lufs(mean(kept));
}

/** The factor to multiply a track by, 1 when it cannot be measured. */
export function levelGain(left: Float32Array, right: Float32Array): number {
  const lufs = loudness(left, right);
  if (!Number.isFinite(lufs)) return 1;
  let peak = 0;
  for (const x of right === left ? [left] : [left, right]) for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > peak) peak = v; }
  const gain = 10 ** ((TARGET_LUFS - lufs) / 20);
  if (gain <= 1) return gain;
  return peak ? Math.max(1, Math.min(gain, 10 ** (PEAK_CEILING_DB / 20) / peak)) : 1;
}
