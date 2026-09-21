import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Draws the app icon (the little light with its face on near-black) and writes PNGs
// without any image library: plain RGBA buffers encoded by hand.

const VOID = [0x0b, 0x0b, 0x10];
const MINT = [0xb8, 0xf2, 0xe6];
const PEARL = [0xf7, 0xf4, 0xff];

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function png(size: number, pixel: (x: number, y: number) => number[]): Uint8Array {
  const raw = new Uint8Array((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r!;
      raw[i + 1] = g!;
      raw[i + 2] = b!;
      raw[i + 3] = a!;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function mix(a: number[], b: number[], t: number): number[] {
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t));
}

function icon(size: number, rounded: boolean): Uint8Array {
  const c = size / 2;
  const R = size * 0.22;
  return png(size, (x, y) => {
    const dx = x + 0.5 - c;
    const dy = y + 0.5 - c * 1.02;
    const d = Math.hypot(dx, dy);
    let rgb = VOID;
    // Soft halo.
    const halo = Math.max(0, 1 - d / (size * 0.44));
    rgb = mix(rgb, MINT, halo * halo * 0.55);
    // Glow ring just outside the dot.
    const edge = Math.max(0, 1 - Math.abs(d - R) / (size * 0.06));
    rgb = mix(rgb, MINT, edge * 0.5);
    // The dot itself.
    if (d < R) rgb = mix(rgb, PEARL, Math.min(1, (R - d) / (size * 0.01)));
    if (d < R * 0.96) rgb = mix(rgb, mix(PEARL, MINT, 0.35), 1);
    // Two eyes.
    for (const ex of [-1, 1]) {
      const e = Math.hypot(dx - ex * R * 0.34, dy - R * -0.08);
      if (e < R * 0.13) rgb = mix(rgb, VOID, 0.85);
    }
    // Optional rounded corners for the maskable/apple variants.
    let alpha = 255;
    if (rounded) {
      const r = size * 0.22;
      const cx = Math.max(0, Math.abs(dx) - (c - r));
      const cy = Math.max(0, Math.abs(y + 0.5 - c) - (c - r));
      if (Math.hypot(cx, cy) > r) alpha = 0;
    }
    return [...rgb, alpha];
  });
}

for (const [name, size, rounded] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
] as const) {
  writeFileSync(resolve('public', name), icon(size, rounded));
  console.log(`wrote public/${name}`);
}
