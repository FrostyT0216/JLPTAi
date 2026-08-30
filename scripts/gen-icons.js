/* 生成 PWA/苹果触屏图标（纯 Node，无依赖） */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x / size, y / size, x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* 多边形内部测试（兼容任意绕向） */
function inPoly(px, py, poly) {
  let pos = false, neg = false;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    if (cross > 0) pos = true; else if (cross < 0) neg = true;
  }
  return !(pos && neg);
}

const LEFT_PAGE = [[0.13, 0.20], [0.47, 0.285], [0.47, 0.76], [0.13, 0.675]];
const RIGHT_PAGE = [[0.87, 0.20], [0.53, 0.285], [0.53, 0.76], [0.87, 0.675]];
const SPINE = [[0.488, 0.24], [0.512, 0.24], [0.512, 0.78], [0.488, 0.78]];

function iconPixel(nx, ny) {
  // 背景：对角渐变 iOS 蓝
  const t = Math.min(1, Math.max(0, (nx + ny) / 2));
  const bg = [
    Math.round(0x3A + (0x00 - 0x3A) * t),
    Math.round(0x9C + (0x51 - 0x9C) * t),
    Math.round(0xFF + (0xD8 - 0xFF) * t),
    255
  ];
  // 书页（白色）：左右镜像映射到左页多边形
  const bookX = 0.5 - Math.abs(nx - 0.5);
  const bookY = ny;
  let color = bg;
  if (inPoly(bookX, bookY, LEFT_PAGE)) color = [255, 255, 255, 255];
  // 中缝镂空
  if (inPoly(nx, ny, SPINE) && ny > 0.27 && ny < 0.76) color = bg;
  return color;
}

// 镂空横线：在书页白色区域内画背景渐变色线，模拟文字行
function iconPixelFinal(nx, ny) {
  const [r, g, b, a] = iconPixel(nx, ny);
  const isWhite = r > 240 && g > 240 && b > 240;
  if (!isWhite) return [r, g, b, a];
  const slope = 0.085 * (Math.abs(nx - 0.5) - 0.13) / 0.34;
  const lines = [0.40, 0.50, 0.60];
  for (const ly of lines) {
    if (Math.abs(nx - 0.5) > 0.09 && Math.abs(nx - 0.5) < 0.31 && Math.abs(ny - (ly + slope)) < 0.02) {
      const t2 = Math.min(1, Math.max(0, (nx + ny) / 2));
      return [
        Math.round(0x3A + (0x00 - 0x3A) * t2),
        Math.round(0x9C + (0x51 - 0x9C) * t2),
        Math.round(0xFF + (0xD8 - 0xFF) * t2), 255];
    }
  }
  return [r, g, b, a];
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png(size, iconPixelFinal));
}
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), png(180, iconPixelFinal));
console.log('icons generated:', fs.readdirSync(outDir));
