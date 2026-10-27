// 特效：粒子、光环、飘字、暗角、故障、震屏、横幅、飞格子。主循环每帧调 drawParts。
import { G } from './状态.js';
import { P, $, sp, restart, pxIcon, ICON, DOWN, bez, rand, stage } from './基础.js';
import { SFX } from './音频.js';

export const parts = [];
export function confetti(x, y, n = 24, cols = [P.mint, P.lgold, P.cyan, P.rose, P.cobalt]) { for (let k = 0; k < n; k++) { const a = rand(-Math.PI, 0), v = rand(80, 240); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 380, c: cols[k % cols.length], life: rand(.6, 1.2), s: Math.random() < .5 ? 2 : 1 }); } }
export function ring(x, y, col, n = 28, v = 150) { for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .7, g: 0, c: k % 3 ? col : P.paper, life: .34, s: 2 }); } }
export function burst(x, y, col, n = 30, v = 220) { for (let k = 0; k < n; k++) { const a = rand(0, Math.PI * 2), s = rand(40, v); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - rand(0, 60), g: 420, c: Math.random() < .25 ? P.paper : col, life: rand(.4, .9), s: Math.random() < .4 ? 2 : 1 }); } }
export function floatAt(text, x, y, color, big) { const d = document.createElement('div'); d.className = 'float' + (big ? ' big' : ''); d.textContent = text; d.style.left = x + 'px'; d.style.top = y + 'px'; if (color) d.style.color = color; $('fxtop').appendChild(d); setTimeout(() => d.remove(), 1300); }
export function floatText(text, el, color, big) { const p = sp(el); floatAt(text, p.x, p.y - 8, color, big); }
export function vignette(kind) { const j = $('joy'); j.className = kind || ''; void j.offsetWidth; j.classList.add('on'); }
export function hurtFlash() { restart($('hurt'), 'on'); }
export function glitch(l = 1) { stage.classList.remove('g1', 'g2'); void stage.offsetWidth; stage.classList.add(l === 2 ? 'g2' : 'g1'); G.bars = performance.now() + (l === 2 ? 260 : 200); setTimeout(() => stage.classList.remove('g1', 'g2'), 400); }
export function shake(big) { restart(stage, big ? 'big' : 'shake'); }
export function flash() { restart($('flash'), 'on'); }
export function banner(t1, t2, col) {
  const b = $('banner'); $('b1').textContent = t1; $('b2').textContent = t2 || ''; b.style.background = col || P.lgold; b.style.boxShadow = `0 0 0 2px ${P.ink},0 0 0 5px ${P.paper}`;
  restart(b, 'on'); setTimeout(() => b.classList.remove('on'), 1950);
}
// 一个格子（行动点 / 控盘额度）从 HUD 飞到目标点，带拖尾
export function flyCell(from, to, cls, col, onArrive) {
  const el = document.createElement('div'); el.className = cls; $('fxtop').appendChild(el); SFX.zap();
  const t0 = performance.now(), dur = 320;
  (function step(now) {
    const t = Math.min(1, (now - t0) / dur), e = t * t; const x = bez(from.x, from.x - 40, to.x + 20, to.x, e), y = bez(from.y, from.y - 90, to.y - 50, to.y, e);
    el.style.transform = `translate(${x}px,${y}px) rotate(${t * 540}deg)`; parts.push({ x, y: y + 4, vx: 0, vy: 0, g: 0, c: col, life: .22, s: 2 });
    if (t < 1) return requestAnimationFrame(step); el.remove(); ring(to.x, to.y, col, 16, 90); onArrive && onArrive();
  })(t0);
}
// 用户点赞 / 点踩的那一下
export function thumbFx(el, good) {
  const p = sp(el), col = good ? P.mint : P.red;
  ring(p.x + 4, p.y + 4, col, 24, good ? 140 : 110);
  const big = pxIcon(good ? ICON.up : DOWN, { k: col }, 4); big.className = 'bigthumb'; big.style.left = (p.x - 12) + 'px'; big.style.top = (p.y - 30) + 'px'; $('fxtop').appendChild(big); setTimeout(() => big.remove(), 800);
  if (good) { confetti(p.x + 4, p.y, 40); vignette(); SFX.thumbUp(); }
  else { for (let k = 0; k < 18; k++) parts.push({ x: p.x + 4, y: p.y + 4, vx: rand(-90, 90), vy: rand(-40, 90), g: 300, c: k % 3 ? P.red : P.k5, life: rand(.3, .6), s: 2 }); SFX.thumbDown(); restart(el.parentElement, 'shk'); }
}
export function drawParts(c, dt, now) {
  c.clearRect(0, 0, 960, 540);
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy += (p.g ?? 420) * dt; p.x += p.vx * dt; p.y += p.vy * dt; c.fillStyle = p.c; c.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
  if (G.bars > now) { for (let k = 0; k < 7; k++) { c.fillStyle = [P.red, P.cyan, P.purple, P.paper][k % 4]; c.globalAlpha = .6; c.fillRect(0, Math.random() * 540 | 0, 960, 1 + Math.random() * 4 | 0); } c.globalAlpha = 1; }
}
