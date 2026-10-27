// 六维图：每个问题类型一张，轴长 = 当前权重分，虚线是今天开始时的形状（美术规范 §12）
import { G, AXES } from './状态.js';
import { P, AT, R, sp } from './基础.js';
import { w } from './训练.js';

const RADARS = new Set();
const vals = t => AXES.map(a => Math.min(1, (w(t, a) ?? .1) / 4));
const prevVals = t => AXES.map(a => Math.min(1, ((G.prev && G.prev[t][a]) ?? .1) / 4));
export function mkRadar(cv, W, t) { const r = { cv, W, t, disp: vals(t), tgt: null, pulse: [0, 0, 0, 0, 0, 0], dirty: true }; r.tgt = r.disp.slice(); RADARS.add(r); return r; }
export function dropRadar(r) { if (r) RADARS.delete(r); }
export function retargetRadar(r) { r.tgt = vals(r.t); r.dirty = true; }
export function radarPt(r, i) { const a = -Math.PI / 2 + i * Math.PI / 3, p = sp(r.cv), k = p.w / r.W, Rr = r.W / 2 - 10; return { x: p.x + (r.W / 2 + Math.cos(a) * Rr * r.tgt[i]) * k, y: p.y + (r.W / 2 + Math.sin(a) * Rr * r.tgt[i]) * k }; }
export function radarLabels(box, r, ox, oy) {
  box.querySelectorAll('.rl').forEach(e => e.remove()); const Wd = r.W, cx = ox + Wd / 2, cy = oy + Wd / 2, Rr = Wd / 2 + 6;
  AXES.forEach((a, i) => { const ang = -Math.PI / 2 + i * Math.PI / 3, l = document.createElement('div'); l.className = 'rl' + (w(r.t, a) == null ? ' off' : ''); l.textContent = AT[a].s; l.style.left = (cx + Math.cos(ang) * Rr) + 'px'; l.style.top = (cy + Math.sin(ang) * (Rr - 2)) + 'px'; box.appendChild(l); });
}
function draw(r) {
  const c = r.cv.getContext('2d'), W = r.W, cx = W / 2, cy = W / 2, Rr = W / 2 - 10, dark = G.mode === 'night' || r.dark; c.clearRect(0, 0, W, W);
  const grid = dark ? P.k5 : P.g4, fill = dark ? P.deep : P.ice, line_ = dark ? P.sky : P.cobalt, old = dark ? P.t3 : P.g3;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [cx + Math.cos(a) * Rr * v, cy + Math.sin(a) * Rr * v]; };
  const line = (x0, y0, x1, y1, col, dash) => { x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy, n = 0; for (; ;) { if (!dash || (n >> 1) % 2 === 0) R(c, col, x0, y0, 1, 1); n++; if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } } };
  const poly = (v, col, dash) => { for (let i = 0; i < 6; i++) { const [a, b] = pt(i, v[i]), [e, f] = pt((i + 1) % 6, v[(i + 1) % 6]); line(a, b, e, f, col, dash); } };
  [.25, .5, .75, 1].forEach(v => poly([v, v, v, v, v, v], grid, true));
  for (let i = 0; i < 6; i++) { const [a, b] = pt(i, 1); line(cx, cy, a, b, grid, true); }
  const cur = r.disp, pts = cur.map((v, i) => pt(i, v));
  const inside = (x, y) => { let ins = false; for (let i = 0, j = 5; i < 6; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; };
  for (let y = 0; y < W; y++) for (let x = (y & 1); x < W; x += 2) if (inside(x + .5, y + .5)) R(c, fill, x, y, 1, 1);
  poly(prevVals(r.t), old, true); poly(cur, line_, false);
  const dot = Math.max(1, Math.round(W / 64));
  AXES.forEach((a, i) => { const [x, y] = pt(i, cur[i]), pu = r.pulse[i], big = pu > 0 ? Math.round(pu * 4) : 0, lockd = w(r.t, a) == null; const s = dot + 1 + big; R(c, P.ink, (x | 0) - s, (y | 0) - s, s * 2 + 1, s * 2 + 1); R(c, lockd ? P.g3 : pu < 0 ? P.red : AT[a].c, (x | 0) - s + 1, (y | 0) - s + 1, s * 2 - 1, s * 2 - 1); });
}
export function radarStatic(cv, t) { draw({ cv, W: cv.width, t, disp: vals(t), pulse: [0, 0, 0, 0, 0, 0] }); }
export function radarTick(dt) {
  for (const r of RADARS) {
    if (!r.cv.isConnected) { RADARS.delete(r); continue; } let ch = r.dirty;
    for (let i = 0; i < 6; i++) { const d = r.tgt[i] - r.disp[i]; if (Math.abs(d) > .0015) { r.disp[i] += d * Math.min(1, dt * 5); ch = true; } else r.disp[i] = r.tgt[i]; if (r.pulse[i] !== 0) { r.pulse[i] = r.pulse[i] > 0 ? Math.max(0, r.pulse[i] - dt * 1.5) : Math.min(0, r.pulse[i] + dt * 1.5); ch = true; } }
    if (ch) { draw(r); r.dirty = false; }
  }
}
