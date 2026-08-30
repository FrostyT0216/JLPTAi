/* 生成 PWA/苹果触屏/网站图标 — 图形来自图标库 icons/svg/book.svg，主题绿色（纯 Node，无依赖） */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ───── PNG 编码 ───── */
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

/* ───── SVG path 解析（M/L/H/V/C/S/Q/T/A/Z，曲线扁平化） ───── */
/* 注意：圆弧的 large-arc/sweep 标志位是单个 0/1 字符，可能与后续数字连写（如 "0 0 1.106.048"），
   必须按命令上下文逐字符解析，不能整体正则分词。 */
function flattenPath(d) {
  let i = 0;
  const len = d.length;
  const skipWs = () => { while (i < len && ' ,\t\n\r'.includes(d[i])) i++; };
  function readNum() {
    skipWs();
    const m = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(d.slice(i));
    if (!m) throw new Error('数字解析失败 @' + i);
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function readFlag() {
    skipWs();
    const f = d[i];
    if (f !== '0' && f !== '1') throw new Error('标志位解析失败 @' + i);
    i++;
    return +f;
  }
  const isCmd = ch => ch && 'MmLlHhVvCcSsQqTtAaZz'.includes(ch);

  const polys = [];
  let poly = [];
  let x = 0, y = 0, sx = 0, sy = 0, cmd = '', pc = null, pqc = null;
  const flush = () => { if (poly.length > 2) polys.push(poly); poly = []; };
  const pt = (a, b) => { poly.push([a, b]); };

  const cubic = (x1, y1, c1x, c1y, c2x, c2y, x2, y2) => {
    const SEG = 20;
    for (let k = 1; k <= SEG; k++) {
      const t = k / SEG, u = 1 - t;
      pt(u * u * u * x1 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x2,
         u * u * u * y1 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y2);
    }
  };
  const quad = (x1, y1, cx, cy, x2, y2) => {
    const SEG = 16;
    for (let k = 1; k <= SEG; k++) {
      const t = k / SEG, u = 1 - t;
      pt(u * u * x1 + 2 * u * t * cx + t * t * x2,
         u * u * y1 + 2 * u * t * cy + t * t * y2);
    }
  };
  const arc = (x1, y1, rx, ry, phiDeg, fA, fS, x2, y2) => {
    if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) { pt(x2, y2); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = phiDeg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
    const dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2;
    const x1p = cos * dx2 + sin * dy2, y1p = -sin * dx2 + cos * dy2;
    let rx2 = rx * rx, ry2 = ry * ry;
    const lam = x1p * x1p / rx2 + y1p * y1p / ry2;
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; rx2 = rx * rx; ry2 = ry * ry; }
    const num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
    const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num / den));
    if (fA === fS) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const th1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
    const th2 = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx);
    let dT = th2 - th1;
    if (!fS && dT > 0) dT -= 2 * Math.PI;
    if (fS && dT < 0) dT += 2 * Math.PI;
    const SEG = 16;
    for (let k = 1; k <= SEG; k++) {
      const t = th1 + dT * k / SEG;
      pt(cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx,
         sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy);
    }
  };

  while (i < len) {
    skipWs();
    if (i >= len) break;
    if (isCmd(d[i])) { cmd = d[i]; i++; }
    switch (cmd) {
      case 'M': case 'm': {
        let fx = readNum(), fy = readNum();
        if (cmd === 'm') { fx += x; fy += y; }
        flush(); pt(fx, fy);
        x = fx; y = fy; sx = fx; sy = fy; pc = null; pqc = null;
        cmd = cmd === 'm' ? 'l' : 'L';
        break;
      }
      case 'L': { x = readNum(); pt(x, y); break; }
      case 'l': { x += readNum(); pt(x, y); break; }
      case 'H': { x = readNum(); pt(x, y); break; }
      case 'h': { x += readNum(); pt(x, y); break; }
      case 'V': { y = readNum(); pt(x, y); break; }
      case 'v': { y += readNum(); pt(x, y); break; }
      case 'C': {
        const c1x = readNum(), c1y = readNum(), c2x = readNum(), c2y = readNum();
        const x2 = readNum(), y2 = readNum();
        cubic(x, y, c1x, c1y, c2x, c2y, x2, y2);
        pc = [c2x, c2y]; x = x2; y = y2; break;
      }
      case 'c': {
        const c1x = x + readNum(), c1y = y + readNum();
        const c2x = x + readNum(), c2y = y + readNum();
        const x2 = x + readNum(), y2 = y + readNum();
        cubic(x, y, c1x, c1y, c2x, c2y, x2, y2);
        pc = [c2x, c2y]; x = x2; y = y2; break;
      }
      case 'S': case 's': {
        let C2X, C2Y, X2, Y2;
        if (cmd === 's') { C2X = x + readNum(); C2Y = y + readNum(); X2 = x + readNum(); Y2 = y + readNum(); }
        else { C2X = readNum(); C2Y = readNum(); X2 = readNum(); Y2 = readNum(); }
        const refX = pc ? 2 * x - pc[0] : x, refY = pc ? 2 * y - pc[1] : y;
        cubic(x, y, refX, refY, C2X, C2Y, X2, Y2);
        pc = [C2X, C2Y]; x = X2; y = Y2; break;
      }
      case 'Q': case 'q': {
        let cx, cy, X2, Y2;
        if (cmd === 'q') { cx = x + readNum(); cy = y + readNum(); X2 = x + readNum(); Y2 = y + readNum(); }
        else { cx = readNum(); cy = readNum(); X2 = readNum(); Y2 = readNum(); }
        quad(x, y, cx, cy, X2, Y2);
        pqc = [cx, cy]; x = X2; y = Y2; break;
      }
      case 'T': case 't': {
        let X2, Y2;
        if (cmd === 't') { X2 = x + readNum(); Y2 = y + readNum(); }
        else { X2 = readNum(); Y2 = readNum(); }
        const cx = pqc ? 2 * x - pqc[0] : x, cy = pqc ? 2 * y - pqc[1] : y;
        quad(x, y, cx, cy, X2, Y2);
        pqc = [cx, cy]; x = X2; y = Y2; break;
      }
      case 'A': case 'a': {
        const rx = readNum(), ry = readNum(), rot = readNum();
        const fA = readFlag(), fS = readFlag();
        let X2, Y2;
        if (cmd === 'a') { X2 = x + readNum(); Y2 = y + readNum(); }
        else { X2 = readNum(); Y2 = readNum(); }
        arc(x, y, rx, ry, rot, fA, fS, X2, Y2);
        x = X2; y = Y2; pc = null; pqc = null; break;
      }
      case 'Z': case 'z': {
        flush(); x = sx; y = sy; pc = null; pqc = null; break;
      }
      default: {
        throw new Error('不支持的路径命令: ' + cmd);
      }
    }
  }
  flush();
  return polys;
}

/* ───── 偶奇扫描线栅格化（4× 超采样抗锯齿） ───── */
function rasterize(polys, size, SS) {
  const RES = size * SS;
  const mask = new Uint8Array(RES * RES);
  const edges = [];
  for (const poly of polys) {
    for (let k = 0; k < poly.length; k++) {
      const [x1, y1] = poly[k], [x2, y2] = poly[(k + 1) % poly.length];
      if (y1 !== y2) edges.push([x1, y1, x2, y2]);
    }
  }
  for (let j = 0; j < RES; j++) {
    const y = (j + 0.5) / RES;
    const xs = [];
    for (const [x1, y1, x2, y2] of edges) {
      const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
      if (y >= yMin && y < yMax) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
    }
    if (!xs.length) continue;
    xs.sort((a, b) => a - b);
    const row = j * RES;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.round(xs[k] * RES));
      const b = Math.min(RES, Math.ceil(xs[k + 1] * RES));
      for (let p = a; p < b; p++) mask[row + p] = 1;
    }
  }
  return mask;
}

/* ───── 主流程：读取图标库 book.svg → 生成主题绿图标 ───── */
const ROOT = path.join(__dirname, '..');
const svgSource = fs.readFileSync(path.join(ROOT, 'icons', 'svg', 'book.svg'), 'utf8');
const dMatch = svgSource.match(/ d="([^"]+)"/);
const vbMatch = svgSource.match(/viewBox="([\d.\-]+)[ ,]+([\d.\-]+)[ ,]+([\d.\-]+)[ ,]+([\d.\-]+)"/);
if (!dMatch || !vbMatch) throw new Error('book.svg 解析失败');
const [, vx, vy, vw, vh] = vbMatch.map(Number);
const pad = 0.10;
const norm = ([px, py]) => [
  pad + (px - vx) / vw * (1 - 2 * pad),
  pad + (py - vy) / vh * (1 - 2 * pad)
];
const polys = flattenPath(dMatch[1]).map(sp => sp.map(norm));

/* 主题绿渐变：accent-2 #46B79D → accent #2E8F80（与应用按钮渐变一致），书本为白色 */
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function makePixelFn(mask, size, SS) {
  const RES = size * SS;
  return (nx, ny) => {
    const t = Math.min(1, Math.max(0, (nx + ny) / 2));
    const bg = [lerp(0x46, 0x2E, t), lerp(0xB7, 0x8F, t), lerp(0x9D, 0x80, t), 255];
    const p = Math.min(size - 1, Math.floor(nx * size)) * SS;
    const q = Math.min(size - 1, Math.floor(ny * size)) * SS;
    let c = 0;
    for (let dy = 0; dy < SS; dy++) {
      const row = (q + dy) * RES;
      for (let dx = 0; dx < SS; dx++) c += mask[row + p + dx];
    }
    const a = c / (SS * SS);
    if (a <= 0) return bg;
    return [lerp(bg[0], 255, a), lerp(bg[1], 255, a), lerp(bg[2], 255, a), 255];
  };
}

const SS = 4;
const outDir = path.join(ROOT, 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png(size, makePixelFn(rasterize(polys, size, SS), size, SS)));
}
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), png(180, makePixelFn(rasterize(polys, 180, SS), 180, SS)));

/* 网站图标 favicon.svg：圆角绿渐变底 + 白色书本（矢量，来自同一图标） */
const margin = 2.2;
const s = (24 - 2 * margin) / 6;
const o = margin - 2 * s;
const favSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#46B79D"/><stop offset="1" stop-color="#2E8F80"/></linearGradient></defs>
<rect width="24" height="24" rx="5.5" fill="url(#g)"/>
<path fill="#FFFFFF" transform="translate(${o.toFixed(3)} ${o.toFixed(3)}) scale(${s.toFixed(3)})" d="${dMatch[1]}"/>
</svg>
`;
fs.writeFileSync(path.join(outDir, 'favicon.svg'), favSvg);

console.log('icons generated:', fs.readdirSync(outDir).filter(f => !f.endsWith('.svg') || f === 'favicon.svg'));
