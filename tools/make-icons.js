// アイコン PNG（180・192・512px）を生成する。Node 標準の zlib だけを使う。
// 使い方：node tools/make-icons.js
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [180, 192, 512];
const SS = 4; // 1画素あたりの縦横サンプル数（アンチエイリアス）

// 512px 基準の図案。後に書いたものが上に重なる
const BG = hex('#263241');
const SHAPES = [
  // 青い線（水平）
  { kind: 'polyline', pts: [[96, 174], [424, 174]], width: 44, color: hex('#0079C2') },
  // 橙の線（左下から45°で上がって水平に並走）
  { kind: 'polyline', pts: [[88, 350], [176, 262], [424, 262]], width: 44, color: hex('#F08300') },
  // 乗換駅のカプセル（白地に黒縁）
  ...capsule([256, 174], [256, 262], 34, 10),
  ...capsule([376, 174], [376, 262], 34, 10),
  // 一般駅
  ...ring([128, 174], 24, 9),
  ...ring([120, 318], 24, 9),
];

function capsule(a, b, r, stroke) {
  return [
    { kind: 'capsule', a, b, r, color: hex('#1F2933') },
    { kind: 'capsule', a, b, r: r - stroke, color: hex('#FFFFFF') },
  ];
}
function ring(c, r, stroke) {
  return capsule(c, c, r, stroke);
}

function hex(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}

// 点と線分の距離
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t, qy = ay + dy * t;
  return Math.hypot(px - qx, py - qy);
}

function hit(shape, x, y) {
  if (shape.kind === 'polyline') {
    const { pts, width } = shape;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distSeg(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= width / 2) return true;
    }
    return false;
  }
  if (shape.kind === 'capsule') {
    return distSeg(x, y, shape.a[0], shape.a[1], shape.b[0], shape.b[1]) <= shape.r;
  }
  return false;
}

function render(size) {
  const scale = 512 / size;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * scale;
          const y = (py + (sy + 0.5) / SS) * scale;
          let c = BG;
          for (const s of SHAPES) if (hit(s, x, y)) c = s.color;
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS, o = (py * size + px) * 4;
      rgba[o] = Math.round(r / n);
      rgba[o + 1] = Math.round(g / n);
      rgba[o + 2] = Math.round(b / n);
      rgba[o + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

// --- PNG エンコード ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // ビット深度
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // フィルタなし
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(join(ROOT, 'icons'), { recursive: true });
for (const size of SIZES) {
  const file = join(ROOT, 'icons', `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log('wrote', file);
}
