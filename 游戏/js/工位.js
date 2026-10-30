// 工位：大肥鱼的房间。白天浅色、夜里深色两套画法；显示器、分词机、窗外、灰尘每帧画。
import { G } from './状态.js';
import { P, $, R, dith, rand, DESK_Y, DESK_DY } from './基础.js';
import { NODE } from './转盘.js';
import { loadSprite, playSprite, holds, spriteAvatar, bindHit, HOLD } from './立绘.js';

export { DESK_Y, DESK_DY };
const DD = DESK_DY; document.documentElement.style.setProperty('--dy', DD + 'px');   // 样式.css 里桌子那一组的位置都加 var(--dy)（标题画面的 Zz 也用）
export const MON = { x: 222, y: 268 + DD, w: 154, h: 112 };
const night = () => G.mode === 'night';

// ---------- 墙和桌子 ----------
function drawBack() {
  const b = $('back').getContext('2d'), gl = $('glow').getContext('2d');
  if (night()) {
    const bands = [P.abyss, P.night, P.navy];
    for (let y = 0; y < 486; y++) { const t = y / 486 * 2, i = Math.min(1, Math.floor(t)), fr = t - i; for (let x = 0; x < 600; x++) R(b, fr > dith(x, y) + .12 ? bands[i + 1] : bands[i], x, y, 1, 1); }
    R(b, P.k0, 0, DESK_Y - 2, 600, 2);
    for (let y = 190 + DD; y < DESK_Y; y++) for (let x = 110; x < 500; x++) { const d = Math.hypot((x - 299) / 1.5, y - 320 - DD) / 130; if (d < 1 && (1 - d) * .85 > dith(x, y)) R(b, P.deep, x, y, 1, 1); }
    gl.clearRect(0, 0, 600, 486);
    for (let y = 170 + DD; y < DESK_Y; y++) for (let x = 110; x < 490; x++) { const d = Math.hypot((x - 299) / 1.5, y - 320 - DD) / 110; if (d < 1 && (1 - d) * .85 > dith(x, y)) R(gl, d < .35 ? P.sky : P.cobalt, x, y, 1, 1); }
    R(b, P.k0, 410, 14, 182, 230); R(b, P.k4, 408, 242, 186, 5);
  } else {
    for (let y = 0; y < DESK_Y; y++) { const t = y / DESK_Y; for (let x = 0; x < 600; x++) R(b, t * .9 > dith(x, y) + .35 ? P.g4 : P.mist, x, y, 1, 1); }
    R(b, P.g1, 410, 14, 182, 230); R(b, P.g2, 408, 242, 186, 5); R(b, P.paper, 408, 242, 186, 1);
    for (let y = 246; y < DESK_Y; y++) { const k = (y - 246) / (DESK_Y - 246), x0 = 410 - k * 120, x1 = 592 - k * 110; for (let x = x0 | 0; x < x1; x++) if (((x + y) & 3) === 0) R(b, P.lgold, x, y, 1, 1); }
    R(b, P.ink, 0, DESK_Y - 2, 600, 2);
  }
}
function drawFront() {
  const f = $('front').getContext('2d'); f.clearRect(0, 0, 600, 486);
  if (night()) {
    R(f, P.k0, 0, DESK_Y, 600, 1); R(f, P.k4, 0, DESK_Y + 1, 600, 10); R(f, P.k5, 0, DESK_Y + 1, 600, 1); R(f, P.k2, 0, DESK_Y + 11, 600, 86);
    for (let x = 20; x < 600; x += 148) { R(f, P.k1, x, DESK_Y + 26, 124, 46); R(f, P.k4, x + 54, DESK_Y + 46, 16, 2); }
  } else {
    R(f, P.ink, 0, DESK_Y, 600, 1); R(f, P.g3, 0, DESK_Y + 1, 600, 10); R(f, P.g4, 0, DESK_Y + 1, 600, 1); R(f, P.g2, 0, DESK_Y + 11, 600, 86);
    for (let x = 20; x < 600; x += 148) { R(f, P.g1, x, DESK_Y + 26, 124, 46); R(f, P.g3, x + 54, DESK_Y + 46, 16, 2); }
    for (let y = DESK_Y + 1; y < DESK_Y + 11; y++) for (let x = 300; x < 600; x++) if (((x + y) & 3) === 0 && x > 300 + (y - DESK_Y) * 6) R(f, P.lgold, x, y, 1, 1);
  }
  const m = MON; R(f, P.k0, m.x, m.y, m.w, m.h); R(f, P.k4, m.x + 2, m.y + 2, m.w - 4, m.h - 4); R(f, P.k5, m.x + 2, m.y + 2, m.w - 4, 1);
  R(f, P.k3, m.x + 2, m.y + m.h - 10, m.w - 4, 8); R(f, P.sky, m.x + m.w / 2 - 2, m.y + m.h - 7, 4, 2);
  R(f, P.k0, m.x + m.w / 2 - 12, m.y + m.h, 24, DESK_Y - m.y - m.h); R(f, P.k4, m.x + m.w / 2 - 10, m.y + m.h, 20, DESK_Y - m.y - m.h); R(f, P.k0, m.x + m.w / 2 - 24, DESK_Y - 3, 48, 3);
  R(f, P.k0, 34, DESK_Y - 5, 144, 7); R(f, P.k5, 35, DESK_Y - 5, 142, 5); for (let x = 38; x < 174; x += 5) R(f, P.t3, x, DESK_Y - 4, 3, 1); for (let x = 40; x < 172; x += 5) R(f, P.t3, x, DESK_Y - 2, 3, 1);
  if (!MUG_OFF) { const cx = 184, o = night() ? P.k0 : P.ink; R(f, o, cx, DESK_Y - 26, 20, 27); R(f, P.paper, cx + 1, DESK_Y - 25, 18, 25); R(f, P.cobalt, cx + 1, DESK_Y - 17, 18, 4); R(f, o, cx + 20, DESK_Y - 21, 5, 12); R(f, P.paper, cx + 20, DESK_Y - 19, 3, 8); }
}

// ---------- 房间物件：家具常驻，预训练往里填东西（美术规范 §8.5） ----------
const TH = {
  night: { o: P.k0, back: P.k3, line: P.k5, boxA: P.k5, boxB: P.k4, cork: P.k4, corkDot: P.k3, pin: P.k5, noteLine: P.k5, paper0: P.mist, junk: [P.t3, P.g1, P.teal], hook: P.k5, bookend: P.k5 },
  day: { o: P.ink, back: P.g4, line: P.g2, boxA: P.g2, boxB: P.g3, cork: P.peach, corkDot: P.skinS, pin: P.g2, noteLine: P.g2, paper0: P.paper, junk: [P.g3, P.g1, P.teal], hook: P.g2, bookend: P.g2 },
};
export const POP = { knowledge: [83, 120], colloquial: [266, 70], open: [266, 136], formal: [372, 170], logic: [506, 350 + DD], narrative: [577, 370 + DD] };   // 后两样在桌上
export function drawRoomItems() {
  const ROOM = G.stage, T = TH[G.mode], DY = DESK_Y;
  const w = $('wall').getContext('2d'), d = $('onDesk').getContext('2d'); w.clearRect(0, 0, 600, 486); d.clearRect(0, 0, 600, 486);
  const sx = 14, sw = 138, board = y => { R(w, T.o, sx, y, sw, 5); R(w, T.line, sx, y, sw, 1); };
  R(w, T.o, sx, 36, 4, 150); R(w, T.o, sx + sw - 4, 36, 4, 150); board(36); board(104); board(181);
  R(w, T.back, sx + 4, 41, sw - 8, 63); R(w, T.back, sx + 4, 109, sw - 8, 72);
  if (ROOM.knowledge) {
    const cols = [P.cobalt, P.cobalt, P.sky, P.cobalt, P.deep, P.cobalt, P.sky, P.cobalt, P.deep, P.cobalt, P.sky];
    let x = sx + 6; cols.forEach((c, i) => { const h = 46 + (i % 3) * 6, bw = 10; R(w, T.o, x, 181 - h, bw, h); R(w, c, x + 1, 181 - h + 1, bw - 2, h - 1); R(w, P.lgold, x + 2, 181 - h + 6, bw - 4, 2); R(w, P.lgold, x + 2, 181 - 10, bw - 4, 1); x += bw + 1; });
    if (ROOM.knowledge > 1) {
      let x2 = sx + 6; for (let i = 0; i < 6; i++) { const h = 48, bw = 14; R(w, T.o, x2, 104 - h, bw, h); R(w, P.paper, x2 + 1, 104 - h + 1, bw - 2, h - 1); R(w, P.g3, x2 + 3, 104 - h + 8, bw - 6, 10); R(w, T.line, x2 + 3, 104 - 8, bw - 6, 1); x2 += bw + 1; }
      const gx = sx + 112, gy = 80; for (let y = -12; y <= 12; y++) for (let xx = -12; xx <= 12; xx++) { if (xx * xx + y * y <= 144) { const land = ((xx + 20) * 7 + (y + 20) * 3) % 11 < 4; R(w, xx * xx + y * y > 121 ? T.o : land ? P.mint : P.cobalt, gx + xx, gy + y, 1, 1); } }
      R(w, T.o, gx - 1, gy + 12, 3, 8); R(w, T.o, gx - 7, gy + 19, 15, 2);
    }
  } else { R(w, T.boxA, sx + 60, 170, 20, 11); R(w, T.boxB, sx + 61, 171, 18, 9); }
  const bx = 192, by = 34, bw = 148, bh = 134;
  R(w, T.o, bx, by, bw, bh); R(w, T.cork, bx + 3, by + 3, bw - 6, bh - 6); for (let y = by + 5; y < by + bh - 5; y += 2) for (let x = bx + 5 + (y % 4 ? 0 : 1); x < bx + bw - 5; x += 3) R(w, T.corkDot, x, y, 1, 1);
  [[bx + 8, by + 8], [bx + bw - 12, by + 8], [bx + 8, by + bh - 12], [bx + bw - 12, by + bh - 12]].forEach(([x, y]) => R(w, T.pin, x, y, 4, 4));
  if (ROOM.colloquial) {
    const notes = [[bx + 12, by + 14, P.lgold], [bx + 40, by + 10, P.rose], [bx + 68, by + 18, P.ice], [bx + 18, by + 44, P.mint], [bx + 50, by + 48, P.lgold]];
    notes.forEach(([x, y, c], i) => { R(w, T.o, x, y, 22, 22); R(w, c, x + 1, y + 1, 20, 20); R(w, T.o, x + 9, y - 1, 4, 3); for (let k = 0; k < 3; k++) R(w, T.noteLine, x + 4, y + 8 + k * 4, 9 + ((i + k) % 3) * 2, 1); });
    if (ROOM.colloquial > 1) {
      const px = bx + 96, py = by + 10; R(w, T.o, px, py, 42, 58); R(w, P.gold, px + 1, py + 1, 40, 56);
      R(w, T.o, px + 8, py + 14, 7, 3); R(w, T.o, px + 27, py + 14, 7, 3); R(w, T.o, px + 10, py + 11, 5, 1); R(w, T.o, px + 27, py + 11, 5, 1);
      R(w, T.o, px + 12, py + 30, 18, 3); R(w, P.paper, px + 13, py + 31, 16, 1); R(w, T.o, px + 6, py + 44, 30, 2); R(w, T.o, px + 6, py + 49, 22, 2);
    }
  }
  {
    const ox = bx + 12, oy = by + 80;
    if (ROOM.open === 0) {
      R(w, T.o, ox, oy, 52, 36); R(w, T.paper0, ox + 1, oy + 1, 50, 34); R(w, T.pin, ox + 24, oy - 1, 4, 3);
      for (let k = 0; k < 5; k++) for (let j = 0; j < 7; j++) { if ((k * 7 + j) % 3 !== 0) R(w, T.junk[(k + j) % 3], ox + 5 + j * 6, oy + 6 + k * 6, 4, 2); }
    } else {
      const faces = [[ox, oy, P.teal], [ox + 22, oy + 4, P.lgold], [ox + 44, oy, P.ice], [ox + 66, oy + 6, P.rose], [ox + 88, oy + 2, P.mint], [ox + 10, oy + 24, P.lgold], [ox + 34, oy + 26, P.teal]];
      faces.forEach(([x, y, c], i) => { R(w, T.o, x, y, 18, 18); R(w, c, x + 1, y + 1, 16, 16); R(w, T.o, x + 4, y + 5, 2, 2); R(w, T.o, x + 12, y + 5, 2, 2); R(w, T.o, x + 5, y + 11 + (i % 2), 8, 1); });
      if (ROOM.open > 1) { [[ox + 58, oy + 28, 32, P.teal], [ox + 94, oy + 24, 26, P.ice], [ox + 60, oy + 40, 28, P.mint]].forEach(([x, y, tw, c]) => { R(w, T.o, x, y, tw, 9); R(w, c, x + 1, y + 1, tw - 2, 7); R(w, T.o, x + 3, y + 4, tw - 8, 1); }); }
    }
  }
  const hx = 356, hy = 132; R(w, T.o, hx - 4, hy, 36, 5); R(w, T.hook, hx - 4, hy, 36, 1); R(w, T.o, hx + 4, hy + 5, 3, 7); R(w, T.o, hx + 20, hy + 5, 3, 7);
  if (ROOM.formal > 1) {
    R(w, T.o, hx - 6, hy + 12, 44, 90); R(w, P.k4, hx - 5, hy + 13, 42, 88); R(w, P.k3, hx - 5, hy + 13, 6, 88); R(w, P.k3, hx + 31, hy + 13, 6, 88);
    R(w, P.paper, hx + 9, hy + 13, 14, 28); R(w, P.cobalt, hx + 14, hy + 16, 4, 22); R(w, T.o, hx + 6, hy + 13, 4, 38); R(w, T.o, hx + 22, hy + 13, 4, 38); for (let k = 0; k < 3; k++) R(w, T.o, hx + 15, hy + 58 + k * 12, 2, 2);
  }
  if (ROOM.formal) {
    R(w, P.cobalt, hx + 4, hy + 12, 2, 30); R(w, P.cobalt, hx + 10, hy + 12, 2, 30);
    R(w, T.o, hx - 1, hy + 40, 18, 24); R(w, P.paper, hx, hy + 41, 16, 22); R(w, P.cobalt, hx, hy + 41, 16, 5); R(w, P.g3, hx + 3, hy + 50, 10, 2); R(w, P.g3, hx + 3, hy + 54, 8, 1); R(w, P.g3, hx + 3, hy + 57, 6, 1);
  }
  const ex = 556; R(d, T.o, ex, DY - 34, 4, 34); R(d, T.o, ex + 38, DY - 34, 4, 34); R(d, T.bookend, ex, DY - 2, 42, 2);
  if (ROOM.narrative) {
    const bk = ROOM.narrative > 1 ? [[P.k0, P.lgold], [P.deep, P.lgold], [P.rose, P.paper], [P.k4, P.lgold]] : [[P.rose, P.paper], [P.gold, P.paper], [P.ice, P.paper]];
    let x = ex + 5; bk.forEach(([c, e], i) => { const h = ROOM.narrative > 1 ? 30 : 24 + (i % 2) * 3, bw2 = ROOM.narrative > 1 ? 7 : 9; R(d, T.o, x, DY - h, bw2, h); R(d, c, x + 1, DY - h + 1, bw2 - 2, h - 2); R(d, e, x + 2, DY - h + 4, bw2 - 4, 2); x += bw2 + 1; });
  }
  const lx = 466;
  if (!ROOM.logic) { R(d, T.o, lx, DY - 8, 80, 8); R(d, P.k4, lx + 1, DY - 7, 78, 6); R(d, P.k5, lx + 1, DY - 7, 78, 1); R(d, P.cobalt, lx + 38, DY - 5, 4, 2); }
  else {
    const big = ROOM.logic > 1, lw = big ? 84 : 72, lh = big ? 66 : 54, ly = DY - (big ? 80 : 64), x0 = big ? lx - 2 : lx + 4;
    R(d, T.o, x0, ly, lw, lh); R(d, P.abyss, x0 + 3, ly + 3, lw - 6, lh - 6);
    const lines = [[P.mint, 30], [P.sky, 46], [P.ice, 22], [P.t3, 38], [P.mint, 52], [P.lgold, 18], [P.sky, 34], [P.ice, 44]];
    lines.slice(0, big ? 5 : 8).forEach(([c, l], i) => R(d, c, x0 + 6 + (i % 3 === 1 ? 6 : 0), ly + 7 + i * 5, Math.min(l, lw - 16), 2));
    if (big) {
      const fx = x0 + 54, fy = ly + 8; R(d, P.mint, fx, fy, 18, 8); R(d, T.o, fx + 8, fy + 8, 2, 6); R(d, P.lgold, fx - 8, fy + 14, 14, 8); R(d, P.sky, fx + 12, fy + 14, 14, 8); R(d, T.o, fx - 2, fy + 12, 24, 2); R(d, P.mint, fx, fy + 30, 18, 8); R(d, T.o, fx + 8, fy + 22, 2, 8);
      R(d, T.o, x0 + lw / 2 - 8, ly + lh, 16, DY - ly - lh);
    } else { R(d, T.o, x0 - 4, DY - 10, lw + 8, 10); R(d, P.k5, x0 - 3, DY - 9, lw + 6, 8); R(d, P.t3, x0 + lw / 2 - 10, DY - 6, 20, 2); }
  }
}
// 主题切换（白天 ↔ 夜间）时重画静态的部分
export function drawRoom() { drawBack(); drawFront(); drawRoomItems(); }

// ---------- 窗外 ----------
const WW_ = 178, WH_ = 226;
const SKYN = { stars: Array.from({ length: 36 }, () => ({ x: Math.random() * WW_ | 0, y: Math.random() * 110 | 0, p: Math.random() * 6 })),
  bld: [[0, 150, 26], [24, 128, 22], [44, 160, 30], [72, 116, 24], [94, 140, 28], [120, 124, 20], [138, 150, 22], [156, 132, 22]], lit: [], shoot: null, next: performance.now() + 3000 };
SKYN.bld.forEach(([x, y, w]) => { for (let yy = y + 5; yy < WH_; yy += 7) for (let xx = x + 3; xx < x + w - 3; xx += 5) SKYN.lit.push({ x: xx, y: yy, on: Math.random() < .35 }); });
const SKYD = { clouds: Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * WW_, y: 10 + i * 16 + Math.random() * 8, w: 20 + Math.random() * 24, v: 2 + Math.random() * 4 })) };
function skyCols() { const t = (G.clock - 9 * 60) / (9 * 60); if (t < .7) return [P.sky, P.ice, P.lgold]; if (t < .95) return [P.cobalt, P.peach, P.lgold]; return [P.deep, P.rose, P.gold]; }
export function drawWindow(now, dt) {
  const c = $('win').getContext('2d');
  if (night()) {
    R(c, P.abyss, 0, 0, WW_, WH_);
    SKYN.stars.forEach(s => { const tw = Math.sin(now / 600 + s.p) > .2; R(c, tw ? P.ice : P.g1, s.x, s.y, 1, 1); });
    R(c, P.ice, 130, 18, 14, 14); R(c, P.abyss, 135, 15, 12, 12);
    if (!SKYN.shoot && now > SKYN.next) SKYN.shoot = { t0: now, x: rand(60, 170), y: rand(6, 40) };
    if (SKYN.shoot) { const t = (now - SKYN.shoot.t0) / 800; if (t > 1) { SKYN.shoot = null; SKYN.next = now + rand(4000, 9000); } else { for (let k = 0; k < 8; k++) R(c, k ? P.cyan : P.paper, SKYN.shoot.x - t * 80 + k * 2, SKYN.shoot.y + t * 30 - k, 1, 1); } }
    SKYN.bld.forEach(([x, y, w]) => R(c, P.k1, x, y, w, WH_ - y));
    if (Math.random() < .08) { const l = SKYN.lit[Math.random() * SKYN.lit.length | 0]; l.on = !l.on; }
    SKYN.lit.forEach(l => { if (l.on) R(c, (l.x + l.y) % 3 ? P.lgold : P.ice, l.x, l.y, 2, 2); });
    R(c, P.k0, 87, 0, 4, WH_); R(c, P.k0, 0, 108, WW_, 4);
  } else {
    const [top, bot, sun] = skyCols();
    for (let y = 0; y < WH_; y++) { const t = y / WH_; for (let x = 0; x < WW_; x++) R(c, t > dith(x, y) * .6 + .2 ? bot : top, x, y, 1, 1); }
    const t = Math.min(1, Math.max(0, (G.clock - 9 * 60) / (9 * 60))), sx = 20 + t * 140, sy = 70 - Math.sin(t * Math.PI) * 52 + t * t * 30;
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const dd = x * x + y * y; if (dd <= 81) R(c, dd <= 40 ? P.paper : sun, sx + x | 0, sy + y | 0, 1, 1); }
    SKYD.clouds.forEach(cl => { cl.x += cl.v * dt; if (cl.x > WW_ + 30) cl.x = -cl.w; R(c, P.paper, cl.x | 0, cl.y | 0, cl.w | 0, 5); R(c, P.paper, (cl.x + 5) | 0, (cl.y - 3) | 0, (cl.w - 12) | 0, 3); R(c, P.mist, cl.x | 0, (cl.y + 5) | 0, cl.w | 0, 1); });
    SKYN.bld.forEach(([x, y, wd], i) => { R(c, i % 2 ? P.g3 : P.g2, x, y, wd, WH_ - y); for (let yy = y + 5; yy < WH_; yy += 7) for (let xx = x + 3; xx < x + wd - 3; xx += 5) R(c, (xx + yy) % 3 ? P.g4 : P.ice, xx, yy, 2, 2); });
    R(c, P.g1, 87, 0, 4, WH_); R(c, P.g1, 0, 108, WW_, 4);
  }
}
export const DUST = Array.from({ length: 30 }, () => ({ x: Math.random() * 600, y: Math.random() * (DESK_Y - 10), vx: rand(-3, 3), vy: rand(-4, -1), p: Math.random() * 6 }));
const STEAM = [];
export function drawDust(dt, now) {
  const c = $('dust').getContext('2d'); c.clearRect(0, 0, 600, 486);
  DUST.forEach(d => {
    d.x += d.vx * dt; d.y += d.vy * dt; if (d.y < 0) { d.y = DESK_Y - 10; d.x = Math.random() * 600; }
    if (Math.sin(now / 900 + d.p) <= -.3) return;
    const col = night() ? (Math.hypot(d.x - 299, d.y - 320 - DD) < 150 ? P.cyan : P.g1) : (d.x > 300 && d.y > 200 ? P.lgold : P.g3);
    R(c, col, Math.round(d.x), Math.round(d.y), 1, 1);
  });
  if (Math.random() < dt * 3) STEAM.push({ x: 193 + rand(-3, 3), y: DESK_Y - 28, life: 1.6 });
  for (let i = STEAM.length - 1; i >= 0; i--) { const s = STEAM[i]; s.life -= dt; s.y -= 10 * dt; s.x += Math.sin(now / 300 + i) * .15; if (s.life <= 0) { STEAM.splice(i, 1); continue; } if (s.life > .4 || Math.random() < .5) R(c, P.g3, Math.round(s.x), Math.round(s.y), 1, 1); }
}

// ---------- 显示器：夜里是推理控制台和各个应用，白天是桌面壁纸 ----------
export const APPS = { console: '推理 · dafeiyu-v3', idle: '桌面 · 白天', wiki: '百科 · 瑞利散射', chat: '聊天 · 表情包', novel: '写作 · 第一章', ide: 'IDE · main.py', doc: '公文 · 回复函',
  noise: '#?%∑ · ▒▒▒', danmaku: '视频 · 弹幕', notepad: '记事本 · 无标题', terminal: '终端 · bash', repeat: '我理解你 · 我理解你', rlhf: 'RLHF · 标注台', eat: '外卖 · 已送达', reply: '消息 · 回复中' };
export const ATTR_APP = { knowledge: 'wiki', colloquial: 'chat', narrative: 'novel', logic: 'ide', formal: 'doc', open0: 'noise', open: 'danmaku', intuition: 'notepad', egg: 'repeat' };
const SCR = { app: 'idle', prog: 0, openT: -1e9, lines: [], cur: { len: 0, c: P.mint, ind: 0 }, gpu: .25 };
for (let i = 0; i < 9; i++) SCR.lines.push({ len: 10 + Math.random() * 60 | 0, c: [P.mint, P.sky, P.ice, P.t3, P.lgold][i % 5], ind: (i % 3) * 6 });
const hsh = i => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
export function setScreen(app) { if (!APPS[app] || SCR.app === app) return; SCR.app = app; SCR.prog = 0; SCR.openT = performance.now(); $('scrtitle').textContent = APPS[app]; }
export function scrToken() { SCR.prog++; SCR.cur.len += 4 + Math.random() * 8; if (SCR.cur.len > 78) { SCR.lines.push(SCR.cur); SCR.lines.shift(); SCR.cur = { len: 0, c: [P.mint, P.sky, P.ice, P.t3, P.lgold][Math.random() * 5 | 0], ind: (Math.random() * 3 | 0) * 6 }; } }
const SCREEN_DRAW = {
  console(c, now) {
    const Ls = [...SCR.lines.slice(-7), SCR.cur];
    Ls.forEach((l, i) => { const y = 18 + i * 8; R(c, P.g1, 4, y, 3, 2); R(c, l.c, 10 + l.ind, y, Math.min(l.len, 82 - l.ind), 2); });
    if (Math.floor(now / 400) % 2) R(c, P.paper, 10 + SCR.cur.ind + Math.min(SCR.cur.len, 82), 18 + 7 * 8 - 1, 2, 4);
    R(c, P.night, 98, 16, 40, 58); const node = NODE.state !== 'hidden' && NODE.cards.length;
    const vals = node ? NODE.cards.map(cd => cd.attr === 'egg' ? .02 : cd.p) : [0, 1, 2, 3, 4].map(i => .25 + .2 * Math.sin(now / 300 + i * 1.7) + G.glow * .3);
    const cols = node ? NODE.cards.map(cd => ATTRC(cd.attr)) : [P.cobalt, P.gold, P.mint, P.rose, P.teal];
    vals.slice(0, 5).forEach((v, i) => { const h = Math.max(2, Math.min(52, v * (node ? 105 : 52) | 0)), x = 101 + i * 7; R(c, (node && NODE.hit === i) ? P.paper : cols[i], x, 72 - h, 5, h); });
    R(c, P.g1, 98, 73, 40, 1);
  },
  idle(c, now) {   // 白天的桌面：蓝天草坡壁纸、桌面图标、任务栏
    for (let y = 14; y < 82; y++) for (let x = 0; x < 142; x++) R(c, (y - 14) / 68 > dith(x, y) * .7 + .15 ? P.ice : P.sky, x, y, 1, 1);
    for (let x = 0; x < 142; x++) { const h = 58 + Math.sin(x / 22 + 1) * 6 + Math.sin(x / 9) * 2; for (let y = h | 0; y < 82; y++) R(c, y - h < 2 ? P.mint : ((x + y) & 3) === 0 ? P.good : P.mint, x, y, 1, 1); }
    const sx = 114, sy = 30; for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 36) R(c, x * x + y * y < 16 ? P.paper : P.lgold, sx + x, sy + y, 1, 1);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + now / 1600; R(c, P.lgold, sx + Math.cos(a) * 10 | 0, sy + Math.sin(a) * 10 | 0, 2, 2); }
    const cx = (now / 90) % 180 - 30; R(c, P.paper, cx | 0, 24, 26, 5); R(c, P.paper, (cx + 6) | 0, 21, 14, 3); R(c, P.paper, ((cx + 70) % 180 - 30) | 0, 40, 18, 4);
    [P.cobalt, P.gold, P.rose].forEach((col, i) => { R(c, P.paper, 6, 18 + i * 14, 10, 10); R(c, col, 7, 19 + i * 14, 8, 8); R(c, P.paper, 4, 29 + i * 14, 14, 1); });
    R(c, P.mist, 0, 82, 142, 14); R(c, P.cobalt, 2, 84, 14, 10); R(c, P.paper, 6, 87, 6, 4);
    for (let i = 0; i < G.apMax; i++) R(c, i < G.ap ? P.gold : P.g4, 22 + i * 8, 86, 6, 6); R(c, P.g2, 108, 87, 30, 4);
  },
  wiki(c, now, p) {
    R(c, P.paper, 0, 14, 142, 82); R(c, P.mist, 4, 17, 96, 8); R(c, P.g3, 8, 20, 30, 2); R(c, P.cobalt, 92, 18, 6, 6); R(c, P.k0, 4, 29, 46, 4);
    const n = Math.min(10, 1 + (p / 2 | 0)); for (let i = 0; i < n; i++) { const w = i === n - 1 ? Math.min(80, (p % 2 + 1) * 30) : 70 + (hsh(i) * 12 | 0); R(c, i % 4 === 3 ? P.cobalt : P.g3, 4, 37 + i * 5, Math.min(w, 80), 2); }
    R(c, P.ice, 90, 28, 48, 44); R(c, P.k0, 90, 28, 48, 1);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 25) R(c, P.gold, 100 + x, 38 + y, 1, 1);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + now / 2000; R(c, P.lgold, 100 + Math.cos(a) * 8 | 0, 38 + Math.sin(a) * 8 | 0, 1, 1); }
    for (let k = 0; k < Math.min(26, p); k++) { const x = 94 + hsh(k * 3) * 42 | 0, y = 30 + hsh(k * 7) * 40 | 0, tw = Math.sin(now / 200 + k) > 0; R(c, tw ? P.cobalt : P.sky, x, y, 2, 2); }
    R(c, P.g3, 90, 75, 40, 2); R(c, P.mint, 4, 90, 20, 3);
  },
  chat(c, now, p) {
    R(c, P.night, 0, 14, 142, 82);
    const n = Math.min(6, 1 + (p / 3 | 0)); for (let i = 0; i < n; i++) { const me = i % 2 === 1, y = 62 - (n - 1 - i) * 9, w = 20 + hsh(i) * 50 | 0; R(c, me ? P.cobalt : P.k4, me ? 138 - w : 4, y, w, 7); R(c, me ? P.paper : P.t15, (me ? 138 - w : 4) + 3, y + 3, Math.max(4, w - 10), 1); }
    R(c, P.k1, 0, 72, 142, 24);
    for (let k = 0; k < 6; k++) { const x = 6 + k * 22, y = 76 + (Math.floor(now / 180) % 6 === k ? -2 : 0), col = [P.gold, P.rose, P.mint, P.lgold, P.ice, P.teal][k]; R(c, P.k0, x, y, 14, 14); R(c, col, x + 1, y + 1, 12, 12); R(c, P.k0, x + 3, y + 4, 2, 2); R(c, P.k0, x + 9, y + 4, 2, 2); R(c, P.k0, x + 4, y + 9, 6, 1 + (k % 2)); }
  },
  novel(c, now, p) {
    R(c, P.mist, 0, 14, 142, 82); const cols = 16, rows = 9, cw = 8, ch = 8, ox = 7, oy = 17;
    for (let r = 0; r <= rows; r++) R(c, P.rose, ox, oy + r * ch, cols * cw, 1); for (let q = 0; q <= cols; q++) R(c, P.rose, ox + q * cw, oy, 1, rows * ch);
    const filled = Math.min(cols * rows, p * 3); for (let k = 0; k < filled; k++) { const r = k / cols | 0, q = k % cols; if (hsh(k) > .12) R(c, P.ink, ox + q * cw + 2, oy + r * ch + 2, 4 + (hsh(k * 5) > .5 ? 0 : -1), 4); }
    const k = filled, r = k / cols | 0, q = k % cols; if (r < rows && Math.floor(now / 300) % 2) R(c, P.rose, ox + q * cw + 3, oy + r * ch + 2, 1, 5);
  },
  ide(c, now, p) {
    R(c, P.k1, 0, 14, 142, 82); R(c, P.k3, 0, 14, 30, 76);
    [[P.gold, 0], [P.sky, 1], [P.sky, 1], [P.mint, 1], [P.gold, 0]].forEach(([col, ind], i) => { R(c, i === 2 ? P.k5 : P.k3, 1, 17 + i * 7, 28, 6); R(c, col, 3 + ind * 4, 18 + i * 7, 4, 4); R(c, P.t3, 9 + ind * 4, 19 + i * 7, 14 - ind * 4, 2); });
    R(c, P.k2, 30, 14, 10, 76);
    const n = Math.min(9, 1 + (p / 1.5 | 0));
    for (let i = 0; i < n; i++) { const y = 17 + i * 8; R(c, P.t3, 33, y + 1, 4, 2); let x = 44 + (i % 3 === 1 ? 6 : i % 3 === 2 ? 12 : 0); const seg = [[P.rose, 8], [P.sky, 14], [P.t15, 6], [P.mint, 18], [P.t3, 10]]; const m = 2 + (hsh(i) * 3 | 0); for (let s = 0; s < m; s++) { const [col, w] = seg[(i + s) % 5]; if (x + w > 138) break; R(c, col, x, y + 1, w, 2); x += w + 3; } }
    if (Math.floor(now / 400) % 2) R(c, P.paper, 46, 17 + (n - 1) * 8 + 8, 2, 5);
    R(c, P.mint, 0, 90, 142, 6); R(c, P.k0, 4, 92, 30, 2); R(c, P.k0, 110, 92, 28, 2);
  },
  doc(c, now, p) {
    R(c, P.k3, 0, 14, 142, 82); R(c, P.paper, 22, 16, 98, 78); R(c, P.cobalt, 26, 20, 90, 2); R(c, P.k0, 46, 26, 50, 4);
    const n = Math.min(9, 1 + (p / 2 | 0)); for (let i = 0; i < n; i++) { const ind = i === 0 || i === 4 ? 8 : 0; R(c, P.g3, 28 + ind, 36 + i * 5, (i === n - 1 ? 40 : 84) - ind, 2); }
    if (p > 16) { const sx = 98, sy = 78, on = Math.min(1, (p - 16) / 3); for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const d = x * x + y * y; if ((d <= 81 && d >= 56) || (Math.abs(x) < 2 && Math.abs(y) < 2)) if (hsh(x * 31 + y) < on) R(c, P.cobalt, sx + x, sy + y, 1, 1); } }
  },
  noise(c) {
    for (let k = 0; k < 420; k++) R(c, [P.teal, P.k4, P.g1, P.paper, P.deep, P.t3][Math.random() * 6 | 0], Math.random() * 142 | 0, 14 + Math.random() * 82 | 0, 1 + (Math.random() < .2), 1);
    for (let k = 0; k < 4; k++) { const y = 14 + Math.random() * 80 | 0; R(c, [P.teal, P.ice, P.lpurple][k % 3], 0, y, 142, 1 + (Math.random() * 3 | 0)); }
    for (let k = 0; k < 6; k++) R(c, P.k0, Math.random() * 120 | 0, 14 + Math.random() * 70 | 0, 12 + Math.random() * 20 | 0, 6);
  },
  danmaku(c, now, p) {
    R(c, P.k0, 0, 14, 142, 82); R(c, P.deep, 4, 17, 134, 62); R(c, P.navy, 4, 52, 134, 27); R(c, P.gold, 100, 24, 10, 10);
    for (let k = 0; k < 12; k++) { const sp_ = 30 + hsh(k) * 50, x = 142 - ((now / 1000 * sp_ + hsh(k * 9) * 200) % 180), y = 20 + (k % 7) * 8; R(c, [P.teal, P.lgold, P.ice, P.rose, P.paper][k % 5], x | 0, y, 10 + hsh(k * 3) * 20 | 0, 2); }
    R(c, P.k4, 4, 84, 134, 3); R(c, P.rose, 4, 84, Math.min(134, p * 5), 3); R(c, P.paper, 6, 90, 4, 4);
  },
  notepad(c, now, p) {
    R(c, P.paper, 0, 14, 142, 82); R(c, P.mist, 0, 14, 142, 7); [8, 22, 36].forEach(x => R(c, P.g3, x, 16, 10, 2));
    const n = Math.min(12, 1 + (p / 1.2 | 0)); for (let i = 0; i < n; i++) R(c, P.g1, 4, 25 + i * 6, i === n - 1 ? 30 + (now / 40 % 40 | 0) : 60 + (hsh(i) * 70 | 0), 2);
    if (Math.floor(now / 250) % 2) R(c, P.k0, 4, 25 + n * 6, 1, 5);
  },
  terminal(c, now, p) {
    R(c, P.k0, 0, 14, 142, 82); const n = Math.min(9, 1 + (p / 2 | 0));
    for (let i = 0; i < n; i++) { const y = 17 + i * 8, cmd = i % 3 === 0; if (cmd) { R(c, P.mint, 4, y + 1, 4, 3); R(c, P.paper, 11, y + 2, 20 + hsh(i) * 60 | 0, 2); } else R(c, P.t3, 4, y + 2, 30 + hsh(i) * 90 | 0, 2); }
    if (Math.floor(now / 400) % 2) R(c, P.mint, 4, 17 + n * 8, 5, 6);
  },
  repeat(c, now) { R(c, P.night, 0, 14, 142, 82); const off = (now / 40) % 8 | 0; for (let i = -1; i < 11; i++) { const y = 14 + i * 8 + off; R(c, P.sky, 4, y, 34, 2); R(c, P.sky, 42, y, 34, 2); R(c, P.sky, 80, y, 34, 2); } },
  rlhf(c, now) {
    R(c, P.paper, 0, 14, 142, 82); [[6, P.mist], [74, P.mist]].forEach(([x, col], i) => { R(c, col, x, 20, 62, 56); for (let k = 0; k < 5; k++) R(c, P.g3, x + 5, 26 + k * 8, 40 + hsh(k + i * 9) * 14 | 0, 2); const lit = Math.floor(now / 700) % 2 === i; R(c, lit ? P.mint : P.g4, x + 24, 80, 14, 10); });
    R(c, P.cobalt, 64, 44, 14, 2); R(c, P.cobalt, 70, 38, 2, 14);
  },
  eat(c, now) { R(c, P.mist, 0, 14, 142, 82); R(c, P.gold, 0, 14, 142, 12); R(c, P.paper, 40, 40, 62, 36); R(c, P.cobalt, 40, 60, 62, 16); for (let k = 0; k < 3; k++) R(c, P.g3, 52 + k * 14, 30 - ((now / 120 + k * 5) % 10 | 0), 2, 6); R(c, P.mint, 110, 82, 24, 8); },
  reply(c, now, p) { R(c, P.paper, 0, 14, 142, 82); const n = Math.min(8, 1 + (p / 2 | 0)); for (let i = 0; i < n; i++) R(c, i % 3 === 2 ? P.cobalt : P.g3, 8, 22 + i * 8, 30 + hsh(i + 7) * 90 | 0, 3); if (Math.floor(now / 300) % 2) R(c, P.cobalt, 8, 22 + n * 8, 2, 5); },
};
const ATTRC = a => ({ knowledge: P.cobalt, colloquial: P.gold, narrative: P.rose, logic: P.mint, formal: P.g3, open0: P.teal, open: P.teal, confess: P.t2, intuition: P.ice, egg: P.purple }[a] || P.t2);
let whale = null;
export function drawScreen(now) {
  const c = $('scr').getContext('2d'); R(c, P.abyss, 0, 0, 142, 96);
  SCREEN_DRAW[SCR.app](c, now, SCR.prog);
  R(c, night() ? P.navy : P.mist, 0, 0, 142, 14);
  if (!whale) { whale = document.createElement('canvas'); whale.width = 10; whale.height = 6; const w = whale.getContext('2d'); ['..kkkk...k', '.kBBBBk.kk', 'kBwBBBBkBk', 'kBBBBBBBk.', '.kIIIIIk..', '..kkkkk...'].forEach((r, j) => [...r].forEach((ch, i) => { const col = { k: P.k0, B: P.cobalt, w: P.paper, I: P.ice }[ch]; if (col) { w.fillStyle = col; w.fillRect(i, j, 1, 1); } })); }
  c.drawImage(whale, 3, 4);
  [[P.t3, 126], [P.t3, 131], [P.mint, 136]].forEach(([col, x]) => R(c, col, x, 5, 3, 3));
  const busy = G.outBusy, node = NODE.state !== 'hidden'; SCR.gpu += ((busy ? .92 : node ? .6 : .22) + .04 * Math.sin(now / 90) - SCR.gpu) * .08;
  if (SCR.app === 'console') { R(c, P.k3, 4, 80, 134, 5); R(c, SCR.gpu > .8 ? P.lgold : P.mint, 4, 80, Math.round(134 * SCR.gpu), 5); R(c, P.g1, 4, 88, 24, 2); R(c, P.g1, 32, 88, 14, 2); }
  const oe = (now - SCR.openT) / 200; if (oe < 1) { const w = 142 * oe | 0, h = 82 * oe | 0; R(c, P.paper, (142 - w) / 2 | 0, 14 + (82 - h) / 2 | 0, w, h); }
}

// ---------- 分词机：显示器算好，数据顺着线缆送过来，token 从顶部出口一个个吐出去 ----------
export const DEV = { x: 380, y: 286 + DD, w: 76, h: 104, glow: 0, flash: 0, kick: 0, packets: [] };
const SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd', '-': 'g' };
const SEGR = { a: [2, 0, 4, 2], b: [6, 2, 2, 4], c: [6, 7, 2, 4], d: [2, 11, 4, 2], e: [0, 7, 2, 4], f: [0, 2, 2, 4], g: [2, 5, 4, 2] };
function digit(c, x, y, ch, on, off, k = 1) { for (const s of 'abcdefg') { const [sx, sy, w, h] = SEGR[s]; R(c, (SEG7[ch] || '').includes(s) ? on : off, x + sx * k, y + sy * k, w * k, h * k); } }
const TINY = { T: ['kkk', '.k.', '.k.', '.k.', '.k.'], O: ['kkk', 'k.k', 'k.k', 'k.k', 'kkk'], K: ['k.k', 'kk.', 'k..', 'kk.', 'k.k'], E: ['kkk', 'k..', 'kk.', 'k..', 'kkk'], N: ['k.k', 'kkk', 'kkk', 'k.k', 'k.k'] };
function tiny(c, x, y, str, col) { [...str].forEach((ch, i) => { const g = TINY[ch]; if (!g) return; g.forEach((r, j) => [...r].forEach((p, q) => { if (p === 'k') R(c, col, x + i * 4 + q, y + j, 1, 1); })); }); }
export function drawDevice(now, dt) {
  const c = $('tokdev').getContext('2d'), W = DEV.w, H = DEV.h; c.clearRect(0, 0, W, H);
  DEV.glow = Math.max(0, DEV.glow - dt * 6); DEV.flash = Math.max(0, DEV.flash - dt * 14); DEV.kick = Math.max(0, DEV.kick - dt * 12);
  const ky = DEV.kick > .5 ? 1 : 0, hi = night() ? P.cyan : P.lgold;
  if (DEV.glow > .05) for (let y = 0; y < 10; y++) for (let x = 14; x < 62; x++) if (((x + y) & 1) === 0 && Math.hypot((x - 38) / 2.4, y - 10) < 10 * DEV.glow) R(c, hi, x, y, 1, 1);
  R(c, P.k0, 0, 12, W, H - 12); R(c, P.k4, 1, 13, W - 2, H - 14); R(c, P.k5, 1, 13, W - 2, 1); R(c, P.k3, 1, H - 9, W - 2, 7); R(c, P.k0, 6, H - 2, 10, 2); R(c, P.k0, W - 16, H - 2, 10, 2);
  R(c, P.k0, 16, 6 + ky, 44, 9); R(c, P.k5, 17, 7 + ky, 42, 2); R(c, DEV.glow > .05 ? (DEV.glow > .5 ? P.paper : hi) : P.deep, 20, 10 + ky, 36, 3);
  R(c, P.navy, 6, 18, 64, 11); if (whale) c.drawImage(whale, 9, 21); tiny(c, 24, 21, 'TOKEN', P.ice);
  R(c, P.k0, 5, 32, 66, 34); R(c, P.k1, 6, 33, 64, 32);
  const node = G.nodeOn, str = String(Math.min(999, G.tok)).padStart(3, '0'), lead = str.search(/[1-9]/), blinkOff = node && Math.floor(now / 400) % 2;
  for (let i = 0; i < 3; i++) { const ch = blinkOff ? '-' : str[i], lit = DEV.flash > .3 ? P.paper : (node ? P.cyan : P.lgold); digit(c, 11 + i * 20, 36, ch, (lead < 0 || i < lead) && !blinkOff ? P.k3 : lit, P.k2, 2); }
  tiny(c, 6, 70, 'TOK', P.t3);
  const busy = G.outBusy;
  R(c, busy && Math.floor(now / 120) % 2 ? P.mint : P.k3, 48, 70, 5, 5); R(c, node ? P.lgold : P.k3, 56, 70, 5, 5); R(c, P.k3, 64, 70, 5, 5);
  for (let y = 80; y < 92; y += 3) R(c, P.k2, 6, y, 64, 1);
  const cb = $('cable').getContext('2d'); cb.clearRect(0, 0, 96, 14); R(cb, P.k0, 0, 10, 90, 2); R(cb, P.k0, 88, 2, 2, 10); R(cb, P.k0, 88, 2, 6, 2);
  if (busy && Math.random() < dt * 12) DEV.packets.push(0);
  DEV.packets = DEV.packets.filter(p => p < 1); DEV.packets.forEach((p, i) => { DEV.packets[i] += dt * 2.2; const t = DEV.packets[i]; R(cb, hi, Math.min(88, t * 100) | 0, t * 100 > 88 ? Math.max(2, 10 - (t * 100 - 88)) | 0 : 10, 2, 2); });
}

// ---------- 大肥鱼：合伙人交的逐帧动画（立绘.js）；没交的时候用参考图抠图占位 ----------
export const fishImg = $('fish');
export const FISH = { base: null, day: '' };   // 占位图：白天那张（canvas + dataURL）；夜间光影换图时、头像、剧情画面都用它
const onFishReady = [], onSprite = [];
// 占位图好了调一次；正式立绘读进来以后再调一次（头像要换）
export function whenFishReady(fn) { onSprite.push(fn); if (fishImg.naturalWidth) fn(); else onFishReady.push(fn); }
let MUG_OFF = false;   // 她手里端着杯子（coffee）时，桌上那只不画
loadSprite().then(() => { bindHit($('fishhit')); setFish(fishImg.className || 'idle'); onSprite.forEach(f => f()); });
(function () {
  const im = new Image(); im.onload = () => {
    const wd = im.width, h = im.height, c = document.createElement('canvas'); c.width = wd; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, wd, h), a = d.data, seen = new Uint8Array(wd * h), st = [];
    const bg = i => { const r = a[i * 4], g = a[i * 4 + 1], b = a[i * 4 + 2]; return Math.min(r, g, b) > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 60; };
    for (let i = 0; i < wd; i++) { st.push(i, (h - 1) * wd + i); } for (let j = 0; j < h; j++) { st.push(j * wd, j * wd + wd - 1); }
    while (st.length) { const p = st.pop(); if (seen[p]) continue; seen[p] = 1; if (!bg(p)) continue; a[p * 4 + 3] = 0; const px = p % wd, py = (p / wd) | 0; if (px > 0) st.push(p - 1); if (px < wd - 1) st.push(p + 1); if (py > 0) st.push(p - wd); if (py < h - 1) st.push(p + wd); }
    for (let j = 0; j < h; j++) for (let i = 0; i < wd; i++) { if (i > 182 || (i < 20 && j > 175)) a[(j * wd + i) * 4 + 3] = 0; }
    x.putImageData(d, 0, 0);
    // 水平翻转：让她侧向右边的显示器
    const m = document.createElement('canvas'); m.width = wd; m.height = h; const mx = m.getContext('2d'); mx.translate(wd, 0); mx.scale(-1, 1); mx.drawImage(c, 0, 0);
    fishImg.onload = () => onFishReady.splice(0).forEach(f => f());
    FISH.base = m; FISH.day = m.toDataURL(); fishImg.src = FISH.day; fishImg.style.width = wd + 'px'; fishImg.style.height = h + 'px';
  }; im.src = window.FISH_SRC;
})();
export function setFish(s) {
  fishImg.className = ''; $('mouth').className = ''; void fishImg.offsetWidth; fishImg.className = s; $('mouth').className = s;
  playSprite(s, () => { if (fishImg.className === s) setFish('idle'); });   // 播一次的动作播完回待机
  const mug = HOLD[s] === 'mug' && holds(s); if (mug !== MUG_OFF) { MUG_OFF = mug; drawFront(); }
}
// 大肥鱼的头像：从精灵上裁脸
export function fishAvatar() {
  const c = document.createElement('canvas'); c.width = 24; c.height = 24; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = P.ice; x.fillRect(0, 0, 24, 24);
  if (!spriteAvatar(x) && FISH.base) x.drawImage(FISH.base, 74, 78, 72, 72, 0, 0, 24, 24); return c;
}
// 嘴型：叠在精灵嘴上的一小块，白天说话时开合
export const MOUTH = { open: false };
export function mouth(open) { MOUTH.open = open; const c = $('mouth').getContext('2d'); c.clearRect(0, 0, 10, 6); if (!open) return; R(c, P.ink, 2, 0, 6, 1); R(c, P.ink, 1, 1, 8, 4); R(c, P.rose, 3, 2, 4, 2); R(c, P.ink, 2, 5, 6, 1); }
