#!/usr/bin/env node
// Generates the Unstuck PWA icons as PNGs with zero dependencies.
// Draws a tilted amber die on a dark field — the app picks for you.
// Usage: node scripts/make_icons.js   (writes icons/*.png)

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------ png out

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  // One filter byte (0 = none) per scanline, then the row's RGBA bytes.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const dst = y * (size * 4 + 1);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ drawing

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mix = (a, b, t) => a + (b - a) * t;
const mixRGB = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
const over = (dst, src, a) => mixRGB(dst, src, clamp(a, 0, 1));

/** Antialiased coverage from a signed distance in pixels. */
const cover = (d) => clamp(0.5 - d, 0, 1);

function sdRoundRect(px, py, half, radius) {
  const qx = Math.abs(px) - half + radius;
  const qy = Math.abs(py) - half + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

const BG_TOP = [0x16, 0x1b, 0x26];
const BG_BOT = [0x0b, 0x0e, 0x13];
const GLOW = [0xf4, 0xa1, 0x3c];
const DIE_TOP = [0xff, 0xc9, 0x7a];
const DIE_BOT = [0xe0, 0x87, 0x22];
const PIP = [0x24, 0x17, 0x03];

function renderIcon(size, maskable) {
  const out = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  // Maskable icons lose their corners to the platform mask, so shrink the motif
  // into the safe zone (roughly the middle 70%).
  const half = size * (maskable ? 0.27 : 0.34);
  const radius = half * 0.28;
  const angle = -10 * (Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const pipOffset = half * 0.47;
  const pipRadius = half * 0.145;
  const pips = [
    [-pipOffset, -pipOffset], [pipOffset, -pipOffset],
    [0, 0],
    [-pipOffset, pipOffset], [pipOffset, pipOffset],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;

      let rgb = mixRGB(BG_TOP, BG_BOT, clamp((y + 0.5) / size, 0, 1));

      // Warm glow behind the die.
      const glow = Math.max(0, 1 - Math.hypot(px, py) / (size * 0.52));
      rgb = over(rgb, GLOW, Math.pow(glow, 2.6) * 0.3);

      // Die body, in its own rotated frame.
      const lx = px * cos - py * sin;
      const ly = px * sin + py * cos;
      const dDie = sdRoundRect(lx, ly, half, radius);

      // Soft drop shadow, offset down and slightly right.
      const sx = (px - size * 0.012) * cos - (py - size * 0.03) * sin;
      const sy = (px - size * 0.012) * sin + (py - size * 0.03) * cos;
      const dShadow = sdRoundRect(sx, sy, half, radius);
      rgb = over(rgb, [0, 0, 0], clamp(1 - dShadow / (size * 0.07), 0, 1) * 0.35);

      const faceT = clamp((ly + half) / (half * 2), 0, 1);
      rgb = over(rgb, mixRGB(DIE_TOP, DIE_BOT, faceT), cover(dDie));

      // Inner rim: a thin darker edge so the die reads as an object.
      const rim = cover(dDie) * cover(-dDie - size * 0.012);
      rgb = over(rgb, [0xb3, 0x66, 0x14], rim * 0.45);

      for (const [ox, oy] of pips) {
        const dPip = Math.hypot(lx - ox, ly - oy) - pipRadius;
        rgb = over(rgb, PIP, cover(dPip));
      }

      const at = (y * size + x) * 4;
      out[at] = Math.round(clamp(rgb[0], 0, 255));
      out[at + 1] = Math.round(clamp(rgb[1], 0, 255));
      out[at + 2] = Math.round(clamp(rgb[2], 0, 255));
      out[at + 3] = 255;
    }
  }

  return out;
}

// --------------------------------------------------------------------- main

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
];

for (const { file, size, maskable } of targets) {
  const png = encodePNG(size, renderIcon(size, maskable));
  fs.writeFileSync(path.join(outDir, file), png);
  console.log('wrote icons/' + file + ' (' + png.length + ' bytes)');
}
