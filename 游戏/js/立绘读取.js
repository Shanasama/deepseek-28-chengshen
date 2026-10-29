// 工位立绘的规则和读法：游戏（立绘.js）和编辑器的「工位动画」检查页共用一份。
// 不碰游戏页面（不 import 基础.js），编辑器可以直接 import。规则出处：美术规范 §8.2–8.4、工位立绘接口.md。
import { P } from './调色板.js';

export const ACTS = ['idle', 'type', 'think', 'talk', 'read', 'eat', 'sleep', 'happy', 'panic', 'shock', 'stretch', 'pick', 'daze', 'coffee'];
export const ACT_NAME = { idle: '待机', type: '打字', think: '思考', talk: '说话', read: '看书', eat: '吃白饭', sleep: '睡觉', happy: '开心', panic: '慌张', shock: '震惊', stretch: '伸懒腰', pick: '点选', daze: '发呆', coffee: '喝咖啡' };
export const ONCE = new Set(['happy', 'panic', 'shock', 'stretch', 'pick']);   // 播一次，播完回 idle；其余循环
export const HOLD = { eat: 'bowl', coffee: 'mug' };   // 这几个动作把道具画在手里，房间里桌上那份藏起来
export const BASE = { 120: { scale: 2, desk: 110 }, 240: { scale: 1, desk: 220 } };   // 画布边长 → 像素倍率、桌面线（画布坐标）
export const AVA = { x: 46, y: 70, s: 24 };   // 头像框：倍率 2 画布里的位置和边长（倍率 1 时都乘 2），从 idle 第 1 帧裁
export const HEAD_GAP = 15;                    // 待机时头顶离画布顶至少这么多（倍率 2）
export const DEF_MS = 130, ONCE_MAX = 1500;

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const base = p => String(p).split(/[\\/]/).pop();

// Aseprite「导出精灵图」：frames 是数组或对象都行；trim 过的按 spriteSourceSize 放回原位；tag 支持 forward / reverse / pingpong
export function parseAseprite(j, sheet) {
  const warn = [], cells = (Array.isArray(j.frames) ? j.frames : Object.values(j.frames || {})).map(f => {
    const ss = f.sourceSize || f.frame, o = f.spriteSourceSize || { x: 0, y: 0 }, c = canvas(ss.w, ss.h);
    if (f.rotated) warn.push('有帧被旋转了：导出时别勾 Rotate');
    c.getContext('2d').drawImage(sheet, f.frame.x, f.frame.y, f.frame.w, f.frame.h, o.x, o.y, f.frame.w, f.frame.h);
    return { c, ms: f.duration || DEF_MS };
  });
  const tags = j.meta?.frameTags || [], acts = {};
  if (!tags.length) { warn.push('没有标签（Tag）：全部帧先当 idle'); acts.idle = cells; }
  for (const t of tags) {
    let seq = cells.slice(t.from, t.to + 1);
    if (/reverse/.test(t.direction)) seq.reverse();
    if (/pingpong/.test(t.direction)) seq = [...seq, ...seq.slice(1, -1).reverse()];
    acts[String(t.name).trim().toLowerCase()] = seq;
  }
  return { acts, warn };
}
export const asepriteImage = j => base(j.meta?.image || '大肥鱼.png');
// 一帧一张：时长.txt 一行一个交了的动作，「idle: 3000 100 3000 100」；只写一个数 = 每帧都这么长，不写 = 130 毫秒。
// getImg(相对路径) 返回图片或 null（游戏从网址读，编辑器从拖进来的文件读）
export async function parseFolder(text, getImg) {
  const acts = {}, warn = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z]+)\s*[:：]?\s*(.*)$/); if (!m) continue;
    const name = m[1].toLowerCase(), ms = (m[2].match(/\d+/g) || []).map(Number), seq = [];
    for (let k = 1; k <= (ms.length > 1 ? ms.length : 99); k++) {
      const i = await getImg(name + '/' + String(k).padStart(2, '0') + '.png'); if (!i) break;
      const c = canvas(i.width, i.height); c.getContext('2d').drawImage(i, 0, 0); seq.push({ c, ms: ms[k - 1] ?? ms[ms.length - 1] ?? DEF_MS });
    }
    if (seq.length) acts[name] = seq; else warn.push(`「${name}」一张帧都没找到（应为 ${name}/01.png）`);
  }
  return { acts, warn };
}
// GIF（只当样稿）：解出每一帧；色块是放大过的就缩回去；背景是一整片纯色就抠掉。要浏览器有 ImageDecoder
export async function parseGif(blob) {
  const warn = [], d = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' }); await d.tracks.ready; await d.completed;
  const n = d.tracks.selectedTrack.frameCount, raw = [];
  for (let i = 0; i < n; i++) { const { image } = await d.decode({ frameIndex: i }); const c = canvas(image.displayWidth, image.displayHeight); c.getContext('2d').drawImage(image, 0, 0); raw.push({ c, ms: Math.round((image.duration || DEF_MS * 1000) / 1000) }); image.close(); }
  const { width: W, height: H } = raw[0].c, A = raw[0].c.getContext('2d').getImageData(0, 0, W, H).data;
  const k = [8, 6, 5, 4, 3, 2].find(k => W % k === 0 && H % k === 0 && blocky(A, W, H, k)) || 1;
  if (k > 1) warn.push(`GIF 是放大 ${k} 倍的（${W}×${H}），按 ${W / k}×${H / k} 读`);
  const bg = A.slice(0, 4), corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].every(([x, y]) => { const i = (y * W + x) * 4; return A[i + 3] === 255 && near(A, i, bg); });
  if (corners) warn.push('背景不透明（一整片纯色），已自动抠掉；正式交请用透明底');
  const frames = raw.map(f => {
    const s = f.c.getContext('2d').getImageData(0, 0, W, H).data, w = W / k, h = H / k, c = canvas(w, h), x = c.getContext('2d'), o = x.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) { const i = ((y * k) * W + X * k) * 4, q = (y * w + X) * 4; if (corners && near(s, i, bg)) continue; o.data.set([s[i], s[i + 1], s[i + 2], s[i + 3]], q); }
    x.putImageData(o, 0, 0); return { c, ms: f.ms };
  });
  return { frames, warn };
}
const near = (a, i, b) => Math.abs(a[i] - b[0]) + Math.abs(a[i + 1] - b[1]) + Math.abs(a[i + 2] - b[2]) < 14;
function blocky(A, W, H, k) {   // 每个 k×k 的块是不是同一个颜色（抽查一部分行）
  for (let y = 0; y < H; y += k * 3) for (let x = 0; x < W; x += k) { const i = (y * W + x) * 4; for (let d = 1; d < k; d++) { const j = ((y + d) * W + x + d) * 4; if (A[i] !== A[j] || A[i + 1] !== A[j + 1] || A[i + 2] !== A[j + 2] || A[i + 3] !== A[j + 3]) return false; } }
  return true;
}

// 查一遍：画布统一、动作名认得、播一次的不太长、背景透明、头顶留空、调色板（只提醒）
const PAL = new Set(Object.values(P).map(c => c.toUpperCase()));
const hex = (a, i) => '#' + [a[i], a[i + 1], a[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
export function checkSprite(acts) {
  const all = Object.values(acts).flat(), warn = [], info = {};
  if (!all.length) return { ok: false, warn, info };
  const { width: w, height: h } = all[0].c, b = BASE[w];
  if (w !== h || !b) warn.push(`画布是 ${w}×${h}，应为 120×120（倍率 2）或 240×240（倍率 1）`);
  if (all.some(f => f.c.width !== w || f.c.height !== h)) warn.push('有的帧画布大小不一样：换动作时人会跳');
  for (const k of Object.keys(acts)) if (!ACTS.includes(k)) warn.push('认不出的动作名「' + k + '」');
  for (const k of ONCE) if (acts[k]) { const t = acts[k].reduce((s, f) => s + f.ms, 0); if (t > ONCE_MAX) warn.push(`「${ACT_NAME[k]}」播一次要 ${(t / 1000).toFixed(1)} 秒，超过 1.5 秒会拖住流程`); }
  const scale = b?.scale ?? (w <= 120 ? 2 : 1), off = new Map();
  let opaqueEdge = false, top = h;
  for (const f of all) {
    const a = f.c.getContext('2d').getImageData(0, 0, f.c.width, f.c.height).data, W = f.c.width;
    if ([0, W - 1, (f.c.height - 1) * W, f.c.height * W - 1].some(p => a[p * 4 + 3] === 255)) opaqueEdge = true;
    for (let i = 0; i < a.length; i += 4) if (a[i + 3]) { const c = hex(a, i); if (!PAL.has(c)) off.set(c, (off.get(c) || 0) + 1); }
  }
  const idle = acts.idle?.[0]; if (idle) { const a = idle.c.getContext('2d').getImageData(0, 0, w, h).data; for (let y = 0; y < h && top === h; y++) for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3]) { top = y; break; } }
  if (opaqueEdge) warn.push('画布四个角有不透明的像素：背景是不是没去掉？');
  if (idle && top < HEAD_GAP * (3 - scale)) warn.push(`待机时头顶离画布顶只有 ${top} 像素，应至少留 ${HEAD_GAP * (3 - scale)}`);
  if (off.size) warn.push(`有 ${off.size} 种颜色不在调色板里（只提醒）`);
  Object.assign(info, { w, h, scale, desk: b?.desk ?? Math.round(h * 11 / 12), offPalette: [...off.entries()].sort((p, q) => q[1] - p[1]) });
  return { ok: true, warn, info };
}

// 出图模板：桌面线、桌下（会被挡住）、头顶留空线、头像框，还有房间里挨着她的键盘、马克杯、显示器左边（半透明）。
// 房间坐标换算到画布：x / 2，(y − 170) / 2（倍率 1 时不除 2）
export function drawTemplate(x, scale = 2) {
  const k = 3 - scale, n = 120 * k, rect = (c, X, Y, W, H) => { x.fillStyle = c; x.fillRect(X * k, Y * k, W * k, H * k); };
  const room = (c, rx, ry, rw, rh) => rect(c, rx / 2, (ry - 170) / 2, rw / 2, rh / 2);
  x.clearRect(0, 0, n, n);
  rect('rgba(60,60,65,.45)', 0, 110, 120, 10);                       // 桌下：被桌子挡住
  room('rgba(60,60,65,.55)', 34, 385, 144, 7);                        // 键盘
  room('rgba(248,250,255,.35)', 184, 364, 25, 27);                    // 马克杯
  room('rgba(42,42,46,.55)', 222, 268, 154, 112);                     // 显示器左边
  x.fillStyle = 'rgba(232,67,79,.9)'; x.fillRect(0, 110 * k, n, k);   // 桌面线
  x.fillStyle = 'rgba(143,211,255,.7)'; for (let i = 0; i < n; i += 4 * k) x.fillRect(i, HEAD_GAP * k, 2 * k, k);   // 头顶留空线
  x.strokeStyle = 'rgba(255,213,122,.95)'; x.lineWidth = k; x.strokeRect(AVA.x * k + k / 2, AVA.y * k + k / 2, AVA.s * k - k, AVA.s * k - k);   // 头像框
}
