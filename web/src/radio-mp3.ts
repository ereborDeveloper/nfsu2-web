// The length of an mp3 in seconds, counted by its MPEG frames (1152 samples a frame in layer III of MPEG-1, 576 in MPEG-2 and 2.5), not
// estimated from the bitrate.  It is the page's check on a decoder: a buffer twice this long was not decoded right.
// null for anything that is not an mp3 with frames to count.

const BITRATE_1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATE_2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES = [44100, 48000, 32000];

export function mp3Seconds(data: ArrayBuffer): number | null {
  const b = new Uint8Array(data);
  let i = 0;
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) + (b[5] & 0x10 ? 10 : 0);
  let frames = 0, rate = 0, per = 0, lost = 0;
  while (i + 4 <= b.length) {
    const h = (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0;
    const version = (h >>> 19) & 3, layer = (h >>> 17) & 3, br = (h >>> 12) & 15, sr = (h >>> 10) & 3;
    if (h >>> 21 !== 0x7ff || version === 1 || layer !== 1 || !br || br === 15 || sr === 3) { i++; if (++lost > 65536 && !frames) return null; continue; }
    const mpeg1 = version === 3, hz = RATES[sr] >> (version === 3 ? 0 : version === 2 ? 1 : 2);
    const size = Math.floor((mpeg1 ? 144000 : 72000) * (mpeg1 ? BITRATE_1 : BITRATE_2)[br] / hz) + ((h >>> 9) & 1);
    if (!rate) rate = hz; else if (hz !== rate) return null;
    per = mpeg1 ? 1152 : 576;
    const side = i + 4 + (mpeg1 ? ((h >>> 6) & 3) === 3 ? 17 : 32 : ((h >>> 6) & 3) === 3 ? 9 : 17), tag = String.fromCharCode(b[side], b[side + 1], b[side + 2], b[side + 3]);
    if (!(frames === 0 && (tag === 'Xing' || tag === 'Info'))) frames++;
    i += size;
  }
  return frames && rate ? frames * per / rate : null;
}
