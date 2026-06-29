/* Zero-dependency PNG icon generator for Meridian.
 * Draws a lavender rounded tile with a white "leaf-on-line" mark.
 * Run: node generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function makePNG(size) {
  const W = size, H = size;
  const buf = Buffer.alloc(W * H * 4);
  const set = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    const na = a / 255, ia = 1 - na;
    buf[i]   = Math.round(buf[i]   * ia + r * na);
    buf[i+1] = Math.round(buf[i+1] * ia + g * na);
    buf[i+2] = Math.round(buf[i+2] * ia + b * na);
    buf[i+3] = Math.min(255, buf[i+3] + a);
  };

  // rounded-rect background with vertical violet gradient (#7c3aed -> #6d28d9)
  const radius = size * 0.22;
  const inRoundRect = (x, y) => {
    const rx = Math.min(x, W - 1 - x), ry = Math.min(y, H - 1 - y);
    if (rx >= radius || ry >= radius) return true;
    const dx = radius - rx, dy = radius - ry;
    return dx * dx + dy * dy <= radius * radius;
  };
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.round(124 + (109 - 124) * t);
    const g = Math.round(58 + (40 - 58) * t);
    const b = Math.round(237 + (217 - 237) * t);
    for (let x = 0; x < W; x++) if (inRoundRect(x, y)) set(x, y, r, g, b, 255);
  }

  // white mark: a vertical "conductor" line with a leaf/teardrop
  const cx = W / 2;
  const lw = Math.max(2, size * 0.045);
  // stem
  for (let y = size * 0.18; y < size * 0.42; y++)
    for (let x = cx - lw / 2; x < cx + lw / 2; x++) set(Math.round(x), Math.round(y), 255, 255, 255, 255);
  // leaf body (teardrop): filled circle + pointed top via two offset circles
  const lr = size * 0.20, lcy = size * 0.6;
  for (let y = -lr * 1.6; y <= lr; y++) {
    for (let x = -lr; x <= lr; x++) {
      const yy = y;
      // teardrop: circle below, taper above
      let inside;
      if (yy <= 0) {
        const k = 1 + (-yy) / (lr * 1.6); // narrow toward top
        inside = (x * x) / ((lr / k) * (lr / k)) + (yy * yy) / (lr * lr * 2.5) <= 1;
      } else {
        inside = x * x + yy * yy <= lr * lr;
      }
      if (inside) set(Math.round(cx + x), Math.round(lcy + y), 255, 255, 255, 255);
    }
  }
  // central vein (violet) for contrast
  for (let y = lcy - lr * 1.4; y < lcy + lr * 0.7; y++)
    for (let x = cx - lw * 0.35; x < cx + lw * 0.35; x++) set(Math.round(x), Math.round(y), 124, 58, 237, 230);

  return encodePNG(buf, W, H);
}

function encodePNG(rgba, W, H) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const dir = path.join(__dirname, 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const s of [192, 512]) {
  fs.writeFileSync(path.join(dir, `icon-${s}.png`), makePNG(s));
  console.log('wrote icon-' + s + '.png');
}
