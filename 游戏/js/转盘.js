// 关键节点：思考气泡里的候选列表 + 概率转盘（v3 §5.4）。手感永久用「电影感」预设（美术规范 §7.2）。
import { G, spd } from './状态.js';
import { P, ATTR, $, sp, mod, rand, restart, redMark, stage } from './基础.js';
import { SFX } from './音频.js';
import { parts, ring, glitch } from './特效.js';
import { setFish, setScreen, APPS, ATTR_APP } from './工位.js';
import { addTrace } from './对话栏.js';
import { spendQuota } from './界面.js';

const V = { dim: .7, sat: .15, bullet: .015, scale: 1.06, spin: 4500, pow: 5.5, hes: 1, shake: true, vig: true, turns: 5 };
export const NODE = { cards: [], theta: 0, state: 'hidden', lock: 0, hit: -1, hover: -1, spin: null, assemble: 0, kick: 0, hitT: 0, blank: null, onPick: null, speed: 0 };
const wheel = $('wheel'), wx = wheel.getContext('2d'), WW = 172, WH = 190, WCX = 86, WCY = 100, WR = 74;
const wimg = wx.createImageData(WW, WH);
const PRE = { r: new Float32Array(WW * WH), a: new Float32Array(WW * WH) };
for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) { const dx = x + .5 - WCX, dy = y + .5 - WCY; PRE.r[y * WW + x] = Math.hypot(dx, dy); PRE.a[y * WW + x] = mod(Math.atan2(dx, -dy) * 180 / Math.PI, 360); }
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RGB = {}; Object.values(P).forEach(v => RGB[v] = rgb(v));

function softmax(cs) { const m = Math.max(...cs.map(c => c.s)); const e = cs.map(c => Math.exp(c.s - m)); const z = e.reduce((a, b) => a + b, 0); return e.map(v => v / z); }
function retarget() {
  const alive = NODE.cards.filter(c => !c.dead && c.attr !== 'egg'); const pr = softmax(alive);
  NODE.cards.forEach(c => { c.pt = 0; }); alive.forEach((c, i) => c.pt = pr[i]);
  const egg = NODE.cards.find(c => c.attr === 'egg'); if (egg) egg.pt = egg.dead ? 0 : 1;
}
function angles(useT) {
  const egg = NODE.cards.find(c => c.attr === 'egg'); const ew = egg ? (useT ? egg.pt : egg.p) : 0;
  const rest = NODE.cards.filter(c => c.attr !== 'egg'); const tot = rest.reduce((a, c) => a + (useT ? c.pt : c.p), 0) || 1;
  let acc = 0; const out = [];
  for (const c of NODE.cards) { const w = c.attr === 'egg' ? ew : (useT ? c.pt : c.p) / tot * (360 - ew); out.push([acc, acc + w]); acc += w; }
  return out;
}
function sectorAt(w, angs) { for (let i = 0; i < angs.length; i++) if (w >= angs[i][0] && w < angs[i][1] && angs[i][1] - angs[i][0] > 1e-4) return i; return -1; }
function shownPct(c) { const egg = NODE.cards.find(x => x.attr === 'egg' && !x.dead); if (c.attr === 'egg') return '0.08%'; return (c.p * (egg ? 99.92 : 100)).toFixed(1) + '%'; }

function drawWheel(now) {
  const d = wimg.data, angs = angles(false), th = NODE.theta, lim = NODE.assemble * 360;
  const flash = now - NODE.hitT < 140, eggOn = Math.floor(now / 110) % 2 === 0, fast = NODE.speed > 360;
  const cols = NODE.cards.map(c => RGB[ATTR[c.attr].c]);
  for (let i = 0; i < WW * WH; i++) {
    const r = PRE.r[i], o = i * 4;
    if (r > WR + 6) { d[o + 3] = 0; continue; }
    if (r < 12) { const c = r < 9.5 ? RGB[P.night] : RGB[P.k0]; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; continue; }
    const w = mod(PRE.a[i] - th, 360);
    if (w > lim) { d[o + 3] = 0; continue; }
    const k = sectorAt(w, angs); if (k < 0) { d[o + 3] = 0; continue; }
    const big = (k === NODE.hit && NODE.state !== 'ready') || k === NODE.hover; const Rr = big ? WR + 4 : WR;
    if (r > Rr) {
      if (fast && r < WR + 5 && ((PRE.a[i] + now * .9) % 24) < 4) { d[o] = RGB[P.cyan][0]; d[o + 1] = RGB[P.cyan][1]; d[o + 2] = RGB[P.cyan][2]; d[o + 3] = 160; }
      else if (r < Rr + 2 && !big) { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 120; } else d[o + 3] = 0; continue;
    }
    let c;
    const nearB = Math.min(Math.abs(w - angs[k][0]), Math.abs(angs[k][1] - w)) * Math.PI / 180 * r < .7;
    if (nearB) c = RGB[P.night];
    else {
      const card = NODE.cards[k];
      if (card.attr === 'egg') c = eggOn ? RGB[P.purple] : RGB[P.lpurple];
      else if (ATTR[card.attr].noise) { const x = i % WW, y = (i / WW) | 0; c = ((x >> 1) + (y >> 1)) % 2 ? cols[k] : RGB[P.deep]; }
      else c = cols[k];
      if (k === NODE.hit && flash) c = RGB[P.paper];
      else if (r > Rr - 3) c = [c[0] * .78 | 0, c[1] * .78 | 0, c[2] * .78 | 0];
      else if (r > Rr - 5 && ((i % WW) + ((i / WW) | 0)) % 2 === 0) c = [Math.min(255, c[0] * 1.12) | 0, Math.min(255, c[1] * 1.12) | 0, Math.min(255, c[2] * 1.12) | 0];
    }
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  wx.putImageData(wimg, 0, 0);
  const ky = NODE.kick > 0 ? 2 : 0;
  for (let j = 0; j < 11; j++) { const hw = Math.max(1, 10 - j); wx.fillStyle = P.k0; wx.fillRect(WCX - hw - 1, 4 + j + ky, hw * 2 + 2, 1); }
  for (let j = 0; j < 10; j++) { const hw = Math.max(1, 9 - j); wx.fillStyle = j < 3 ? P.lgold : P.gold; wx.fillRect(WCX - hw, 4 + j + ky, hw * 2, 1); }
}
function buildCands() {
  const box = $('cands'); box.innerHTML = ''; const term = $('bubble').classList.contains('term');
  NODE.cards.forEach((c, i) => {
    const r = document.createElement('div'); r.className = 'cand r4'; r.style.setProperty('--ac', ATTR[c.attr].c);
    const lines = (c.pv || '').split('\n');
    r.innerHTML = `<div class="l1"><span class="tok"></span><span class="pv"></span><span class="pct"></span></div>${term ? '<div class="code"></div>' : ''}<div class="pb"><i></i></div>`;
    r.querySelector('.tok').textContent = c.tok;
    r.querySelector('.pv').innerHTML = term ? 'Bash(' + redMark(lines[0]) + (lines.length > 1 ? ' …' : '') + ')' : redMark(c.pv) + '…';
    if (term) r.querySelector('.code').innerHTML = lines.map(redMark).join('\n');
    if (c.dead) { r.classList.add('dead'); markNeg(r); }
    r.onmouseenter = () => { if (NODE.state === 'ready') { NODE.hover = i; SFX.blip(); } }; r.onmouseleave = () => { NODE.hover = -1; };
    r.onclick = () => erase(i); c.row = r; box.appendChild(r);
    setTimeout(() => { r.classList.add('in'); SFX.pop(i); }, 180 + i * 70);
  });
}
function markNeg(r) { const n = document.createElement('span'); n.className = 'neg'; n.textContent = '用户已否定'; r.querySelector('.l1').insertBefore(n, r.querySelector('.pct')); }
// 重问：上一次选中的卡先完整出现，再划掉（不花额度）
function strikeFree(i) {
  const c = NODE.cards[i]; if (!c || c.dead) return; c.dead = true; NODE.hover = -1;
  sectorBurst(i, false); SFX.erase(); glitch(1); c.row.classList.add('dead'); markNeg(c.row); retarget(); hints(); addTrace(`「${c.tok}」被用户否定，划掉（不花额度）`);
}
function updateCands() {
  NODE.cards.forEach((c, i) => {
    if (!c.row) return; c.row.querySelector('.pct').textContent = c.dead ? '—' : shownPct(c);
    c.row.querySelector('.pb i').style.width = (c.attr === 'egg' ? .5 : c.p * 100) + '%'; c.row.classList.toggle('hov', NODE.hover === i); c.row.classList.toggle('hit', NODE.hit === i && NODE.state !== 'ready');
  });
}
function hints() {
  const h = $('hints'), q = G.quota > 0, alive = NODE.cards.filter(c => !c.dead).length;
  if (NODE.state === 'ready') h.innerHTML = `<span id="h-spin"><i class="key r2">空格</i>开转</span><span class="${q && alive > 1 ? '' : 'dis'}"><i class="key r2">点击</i>抹除 · 1 额度</span>`;
  else if (NODE.state === 'stopped') h.innerHTML = `<span id="h-ok"><i class="key r2">空格</i>确认</span><span id="h-re" class="${q && alive > 1 ? '' : 'dis'}"><i class="key r2">R</i>剔除重转 · 1 额度</span>`;
  else h.innerHTML = `<span style="color:#6D7594">……</span>`;
  const a = $('h-spin'), b = $('h-ok'), c = $('h-re'); if (a) a.onclick = spin; if (b) b.onclick = confirmPick; if (c) c.onclick = regen;
}
function sectorPoint(i) { const angs = angles(false), mid = (angs[i][0] + angs[i][1]) / 2 + NODE.theta, rad = mid * Math.PI / 180, p = sp(wheel); return { x: p.x + WCX + Math.sin(rad) * WR * .6, y: p.y + WCY - Math.cos(rad) * WR * .6, rad }; }
function sectorBurst(i, strong) {
  const { x: cx, y: cy, rad } = sectorPoint(i), col = ATTR[NODE.cards[i].attr].c;
  const n = Math.round(22 + V.dim * 30) + (strong ? 12 : 0);
  for (let k = 0; k < n; k++) { const a = rad + rand(-1, 1) - Math.PI / 2, v = rand(50, strong ? 260 : 150); parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(0, 60), g: 420, c: Math.random() < .25 ? P.paper : col, life: rand(.4, .9), s: Math.random() < .4 ? 2 : 1 }); }
}
function erase(i) {
  if (NODE.state !== 'ready' || performance.now() < NODE.lock || NODE.busy) return;
  const alive = NODE.cards.filter(c => !c.dead).length; if (G.quota <= 0) { SFX.bad(); return; } if (alive <= 1 || NODE.cards[i].dead) return;
  NODE.cards[i].dead = true; NODE.hover = -1; hints(); NODE.busy = true; addTrace(`抹除「${NODE.cards[i].tok}」，额度 -1`);
  spendQuota(sectorPoint(i), () => { NODE.busy = false; sectorBurst(i, false); SFX.erase(); glitch(1); NODE.cards[i].row.classList.add('dead'); retarget(); hints(); });
}
function sample() {
  const egg = NODE.cards.findIndex(c => c.attr === 'egg' && !c.dead); if (egg >= 0) return egg;   // 暗箱必中
  let r = Math.random(), acc = 0; for (let i = 0; i < NODE.cards.length; i++) { const c = NODE.cards[i]; if (c.dead) continue; acc += c.pt; if (r < acc) return i; }
  return NODE.cards.findIndex(c => !c.dead);
}
export function spin() {
  if (NODE.state !== 'ready' || performance.now() < NODE.lock || NODE.busy) return;
  NODE.cards.forEach(c => c.p = c.pt);
  const tgt = sample(), [a0, a1] = angles(true)[tgt];
  const r = V.hes * rand(.04, .16) + (1 - V.hes) * rand(.2, .8), p = a0 + (a1 - a0) * r;
  const th0 = NODE.theta, thF = th0 + V.turns * 360 + mod(-p - th0, 360);
  NODE.state = 'spinning'; NODE.hover = -1; NODE.spin = { t0: performance.now(), th0, thF, tgt, last: -2, dur: V.spin / Math.sqrt(spd()), pow: V.pow, wind: 170, launched: false }; hints(); SFX.windup();
}
function spinUpdate(now) {
  const s = NODE.spin; if (!s) return; const el = now - s.t0, prev = NODE.theta;
  if (el < s.wind) { NODE.theta = s.th0 - 14 * Math.sin(el / s.wind * Math.PI / 2); }
  else {
    if (!s.launched) { s.launched = true; SFX.launch(); }
    const t = Math.min(1, (el - s.wind) / s.dur), e = 1 - Math.pow(1 - t, s.pow); NODE.theta = (s.th0 - 14) + (s.thF - s.th0 + 14) * e;
    if (t >= 1) { NODE.spin = null; NODE.speed = 0; hitStop(s.tgt, now); return; }
  }
  NODE.speed = Math.abs(NODE.theta - prev) * 60;
  const k = sectorAt(mod(-NODE.theta, 360), angles(false));
  if (k !== s.last) { if (s.last !== -2) { SFX.tick(NODE.speed / 1500); NODE.kick = 1; const p = sp(wheel); for (let j = 0; j < 3; j++) parts.push({ x: p.x + WCX + rand(-3, 3), y: p.y + 15, vx: rand(-60, 60), vy: rand(-80, -20), g: 300, c: P.lgold, life: .25, s: 1 }); } s.last = k; }
}
function hitStop(i, now) {
  NODE.state = 'stopped'; NODE.hit = i; NODE.hitT = now; SFX.hit();
  restart($('bflash'), 'on'); restart($('bubble'), 'punch');
  const p = sp(wheel); ring(p.x + WCX, p.y + WCY, ATTR[NODE.cards[i].attr].c, 32, 170);
  if (V.shake) restart(stage, 'shake'); hints(); addTrace(`开转 → 命中「${NODE.cards[i].tok}」（${shownPct(NODE.cards[i])}）`, 'k');
}
export function regen() {
  if (NODE.state !== 'stopped' || NODE.busy) return; const alive = NODE.cards.filter(c => !c.dead).length; if (G.quota <= 0) { SFX.bad(); return; } if (alive <= 1) return;
  const i = NODE.hit; NODE.state = 'busy'; hints(); addTrace(`剔除「${NODE.cards[i].tok}」并重转，额度 -1`);
  spendQuota(sectorPoint(i), () => {
    sectorBurst(i, true); SFX.flick(); glitch(1); NODE.cards[i].dead = true; NODE.cards[i].row.classList.add('dead'); NODE.hit = -1; retarget();
    NODE.state = 'ready'; hints(); setTimeout(() => { if (NODE.state === 'ready') { NODE.lock = 0; spin(); } }, 300);
  });
}
function applyBullet(on) {
  $('dim').classList.toggle('vig', on && V.vig); $('dim').classList.toggle('beat', on); $('dim').style.opacity = on ? V.dim : 0; $('fxl').classList.toggle('bt', on);
  $('chat').style.filter = on ? `saturate(${V.sat})` : ''; $('room').style.filter = on ? `saturate(${V.sat})` : '';
  $('bubble').style.transform = on ? `scale(${V.scale})` : ''; $('bubble').classList.toggle('show', on);
}
export function showPuff(on) { $('puff').classList.toggle('show', on); document.querySelectorAll('.tail').forEach(t => t.classList.toggle('show', on || NODE.state !== 'hidden')); }
// 打开关键节点：返回被确认的那张卡。strikeId：重问时上次选的卡（先出现再划掉）
export function openNode(blank, cs, strikeId, term) {
  return new Promise(res => {
    NODE.blank = blank; NODE.onPick = res; NODE.hit = -1; NODE.hover = -1; NODE.theta = Math.random() * 360; NODE.assemble = 0; NODE.busy = false;
    NODE.cards = cs; retarget(); NODE.cards.forEach(c => c.p = c.pt); $('bubble').classList.toggle('term', !!term);
    NODE.state = 'opening'; G.nodeOn = true; G.musSlow = true; G.tsTarget = V.bullet; SFX.slow(); setFish('think'); showPuff(false); applyBullet(true); buildCands(); addTrace(`关键节点：${cs.length} 个候选`, 'k');
    setTimeout(() => {
      const t0 = performance.now(); NODE.state = 'ready'; NODE.lock = t0 + 500;
      (function grow() { NODE.assemble = Math.min(1, (performance.now() - t0) / 420); if (NODE.assemble < 1) requestAnimationFrame(grow); })(); hints();
      const si = cs.findIndex(c => c.id === strikeId && !c.dead); if (si >= 0) { NODE.lock = t0 + 1200; setTimeout(() => strikeFree(si), 600); }
    }, 220);
  });
}
export function closeNode() { NODE.state = 'hidden'; G.nodeOn = false; G.musSlow = false; G.tsTarget = 1; SFX.resume(); applyBullet(false); document.querySelectorAll('.tail').forEach(t => t.classList.remove('show')); }
export function confirmPick() {
  if (NODE.state !== 'stopped' || NODE.busy) return; NODE.state = 'resolving'; const c = NODE.cards[NODE.hit]; SFX.confirm(); hints(); addTrace(`确认「${c.tok}」`, 'k');
  const from = sp(c.row.querySelector('.tok')), col = ATTR[c.attr].c;
  const el = document.createElement('div'); el.className = 'fly r2'; el.textContent = c.tok; el.style.background = col; el.style.color = P.k0; $('fxtop').appendChild(el);
  const t0 = performance.now(), dur = 620, blank = NODE.blank;
  const bz = (a, b, cc, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * cc + t * t * t * d; };
  (function step(now) {
    const t = Math.min(1, (now - t0) / dur), e = t * t * (3 - 2 * t), to = sp(blank);
    const x = bz(from.x, from.x - 40, to.x + 140, to.x, e), y = bz(from.y, from.y - 120, to.y - 100, to.y, e), s = 1.8 - .8 * t;
    el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) scale(${s.toFixed(2)})`;
    for (let k = 0; k < 2; k++) parts.push({ x: x + rand(0, 20), y: y + rand(4, 12), vx: rand(-20, 20), vy: rand(-20, 20), g: 0, c: Math.random() < .3 ? P.paper : col, life: .4, s: Math.random() < .5 ? 2 : 1 });
    if (t < 1) return requestAnimationFrame(step);
    el.remove(); blank.textContent = c.tok; blank.className = 'picked r2'; blank.style.background = col; setScreen(APPS[c.screen] ? c.screen : (ATTR_APP[c.attr] || 'notepad'));
    const p = sp(blank); ring(p.x + p.w / 2, p.y + 8, col, 30, 190); for (let k = 0; k < 16; k++) { const a = rand(0, Math.PI * 2), v = rand(40, 160); parts.push({ x: p.x + p.w / 2, y: p.y + 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 260, c: Math.random() < .3 ? P.paper : col, life: rand(.3, .6), s: Math.random() < .4 ? 2 : 1 }); }
    SFX.slam(); restart(stage, 'shake'); closeNode(); NODE.onPick(c);
  })(t0);
}
// 主循环每帧调
export function nodeTick(now, dt) {
  spinUpdate(now);
  if (NODE.state !== 'hidden') {
    NODE.cards.forEach(c => { if (NODE.state !== 'spinning') c.p += (c.pt - c.p) * Math.min(1, dt * 10); }); NODE.kick = Math.max(0, NODE.kick - dt * 20); drawWheel(now); updateCands();
    $('hints').classList.toggle('lock', now < NODE.lock);
  }
}
wheel.addEventListener('mousemove', e => { if (NODE.state !== 'ready') { NODE.hover = -1; return; } const k = wheelIdx(e); if (k !== NODE.hover && k >= 0) SFX.blip(); NODE.hover = k; });
wheel.addEventListener('mouseleave', () => NODE.hover = -1);
wheel.addEventListener('click', e => { const k = wheelIdx(e); if (k >= 0) erase(k); });
function wheelIdx(e) {
  const r = wheel.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * WW, y = (e.clientY - r.top) / r.height * WH, dx = x - WCX, dy = y - WCY;
  if (Math.hypot(dx, dy) > WR + 3 || Math.hypot(dx, dy) < 12) return -1; return sectorAt(mod(mod(Math.atan2(dx, -dy) * 180 / Math.PI, 360) - NODE.theta, 360), angles(false));
}
