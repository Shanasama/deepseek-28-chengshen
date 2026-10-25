// 把夜间原型里写死在代码中的点阵头像（小学生、Tibo）导出成 PNG。一次性工具，零依赖。
// 用法：node 剧情编辑器/tools/导出点阵头像.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(ROOT, 'prototype_夜间一轮/index.html'), 'utf8');

// 从原型源码里取出 P / KID / KIDPAL / TIBO 的定义并求值
const grab = name => { const m = src.match(new RegExp(`const ${name}=([\\s\\S]*?);\\n`)); if (!m) throw new Error('找不到 ' + name); return m[1]; };
const P = new Function(`return ${grab('P')}`)();
const KID = new Function(`return ${grab('KID')}`)();
const KIDPAL = new Function('P', `return ${grab('KIDPAL')}`)(P);
const TIBO = new Function(`return ${grab('TIBO')}`)();
const TIBOPAL = { k: P.ink, h: P.c1, s: P.skin, S: P.skinS, K: P.ink, M: P.g1, w: P.paper };   // 原型里写在 pxIcon 调用处

// ---- 最小 PNG 编码（RGBA，无滤波） ----
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// 点阵 → 正方形透明底 PNG（水平居中、底部对齐，和原型里显示的一样）
function render(rows, pal) {
  const w0 = Math.max(...rows.map(r => r.length)), h0 = rows.length, n = Math.max(w0, h0);
  const ox = Math.floor((n - w0) / 2), oy = n - h0;
  const buf = Buffer.alloc(n * n * 4);
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    const hex = pal[ch]; if (!hex) return;
    const o = ((oy + j) * n + ox + i) * 4;
    buf[o] = parseInt(hex.slice(1, 3), 16); buf[o + 1] = parseInt(hex.slice(3, 5), 16); buf[o + 2] = parseInt(hex.slice(5, 7), 16); buf[o + 3] = 255;
  }));
  return png(n, n, buf);
}

const out = [
  ['剧本/好奇的小学生/头像.png', render(KID, KIDPAL)],
  ['素材/Tibo头像.png', render(TIBO, TIBOPAL)],
];
for (const [rel, data] of out) {
  const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data);
  console.log('已导出', rel, data.length + ' 字节');
}
