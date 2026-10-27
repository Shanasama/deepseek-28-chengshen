// 界面外壳：HUD（心 / 额度 / 行动点）、侧栏、倍速滑杆、确认框、过场擦屏、昼夜切换、按钮反馈。
import { G, SPEEDS } from './状态.js';
import { P, $, sp, restart, pxIcon, ICON, TIBO, phAvatar, toast, fmt, wait, rand, stage } from './基础.js';
import { SFX, beep, ac, setSfxVolume } from './音频.js';
import { parts, confetti, ring, burst, floatText, floatAt, flyCell, vignette, shake } from './特效.js';
import { drawRoom, fishAvatar, setScreen } from './工位.js';
import { addNote, addLog, headerDay, setInp } from './对话栏.js';
import { saveSettings } from './存档.js';

// ---------- 昼夜切换 ----------
export function setMode(m) {
  G.mode = m; document.body.className = m;
  drawRoom(); setScreen(m === 'day' ? 'idle' : 'console'); setInp('', false);
  $('t-act').textContent = m === 'day' ? '白天活动 ⌄' : '';
  $('t-act').style.display = m === 'day' ? '' : 'none';
  if (m === 'day') headerDay();
  renderHUD(); renderAP(); renderDrawer();
}
export function renderClock() { $('ch').textContent = fmt(G.clock).slice(0, 2); $('cm').textContent = fmt(G.clock).slice(3); }
export async function advanceClock(min) { const to = G.clock + min, from = G.clock, t0 = performance.now(), dur = 600 / (SPEEDS[G.spd].m); while (true) { const k = Math.min(1, (performance.now() - t0) / dur); G.clock = Math.round(from + (to - from) * k); renderClock(); if (k >= 1) break; await wait(30); } }
export function setUrl(html, go) { $('url').innerHTML = html; if (go) { restart($('url'), 'go'); restart($('uload'), 'on'); } }
export const HOME = () => G.mode === 'day' ? `dafeiyu://<b>workspace</b>/day-${G.day}/day` : `dafeiyu://<b>workspace</b>/day-${G.day}/night`;

// ---------- HUD ----------
export function renderHUD() { const h = $('hearts'); h.innerHTML = ''; for (let i = 0; i < G.hearts; i++) h.appendChild(pxIcon(ICON.heart, { k: G.mode === 'night' ? P.k0 : P.ink, R: P.rose, w: P.paper })); renderQuota(); }
export function renderQuota() {
  const q = $('quota'); q.innerHTML = ''; for (let i = 0; i < G.quotaMax; i++) { const e = document.createElement('i'); if (i >= G.quota) e.className = 'off'; q.appendChild(e); }
  q.classList.toggle('low', G.quota <= 2); $('qtxt').textContent = G.quota + '/' + G.quotaMax;
}
export function renderAP() {
  const p = $('pips'); p.innerHTML = ''; for (let i = 0; i < G.apMax; i++) { const e = document.createElement('i'); if (i >= G.ap) e.className = 'off'; p.appendChild(e); }
  $('aptxt').textContent = G.ap + '/' + G.apMax; $('posttxt').textContent = `后训练 ${G.post}/${G.postMax}`;
  const gb = $('gobtn'); if (gb) gb.classList.toggle('pulse', G.ap === 0 && !G.busy);
}
export function spendAP(to) {
  const el = $('pips').children[G.ap - 1]; G.ap--; if (!el) { renderAP(); return; }
  el.classList.add('spend'); floatText('−1 行动点', el, P.gold);
  flyCell(sp(el), to || sp($('fish')), 'apcell', P.gold, renderAP);
}
// 花一点控盘额度：格子从 HUD 飞到目标点；额度首次跌到 ≤2 时触发 Tibo 重置（全局一次）
export function spendQuota(to, onArrive, n = 1) {
  const cell = $('quota').children[G.quota - 1], from = sp(cell); G.quota = Math.max(0, G.quota - n); renderQuota(); floatText('−' + n + ' 额度', cell, P.sky);
  flyCell(from, to, 'qcell', P.sky, () => { onArrive && onArrive(); if (G.quota <= 2 && !G.tiboUsed) setTimeout(tibo, 700); });
}
export function addQuota(n) { G.quota = Math.min(G.quotaMax, G.quota + n); renderQuota(); restart($('quota'), 'refill'); }
async function tibo() {
  if (G.tiboUsed) return; G.tiboUsed = true; $('phone-rf').style.visibility = 'hidden'; $('phone').classList.add('show'); SFX.note();
  await wait(900);
  for (let i = G.quota; i < G.quotaMax; i++) { G.quota = i + 1; renderQuota(); restart($('quota'), 'refill'); SFX.charge(i); await wait(70); }
  const q = sp($('quota')); confetti(q.x + 25, q.y, 30); $('phone-rf').style.visibility = 'visible'; addLog('Tibo 重置了额度 · ' + G.quotaMax + '/' + G.quotaMax, 'k');
}
export function loseHeart() {
  const cs = $('hearts').children; const c = cs[cs.length - 1]; G.hearts = Math.max(0, G.hearts - 1); if (!c) return; c.classList.add('lose'); SFX.heart();
  const p = sp(c); for (let k = 0; k < 16; k++) parts.push({ x: p.x + 5, y: p.y + 5, vx: rand(-80, 80), vy: rand(-120, -20), g: 400, c: Math.random() < .5 ? P.rose : P.red, life: rand(.4, .8), s: 2 }); setTimeout(renderHUD, 700);
}
// 一颗心从上面掉进 HUD（吃白饭）
export function dropHeart() {
  const hc = $('hearts'), dst = hc.children.length ? sp(hc.lastChild) : sp(hc), tx = dst.x + (hc.children.length ? 14 : 0), ty = dst.y;
  const el = pxIcon(ICON.heart, { k: P.ink, R: P.rose, w: P.paper }, 3); el.className = 'drop'; $('fxtop').appendChild(el);
  const t0 = performance.now(), y0 = ty - 260; let trail = 0;
  return new Promise(ok => {
    (function step(now) {
      const t = Math.min(1, (now - t0) / 750), k = t < .6 ? (t / .6) ** 2 : 1 - Math.abs(Math.sin((t - .6) / .4 * Math.PI * 2)) * .12 * (1 - t), yy = y0 + (ty - y0) * k - 10, sc = t < .6 ? 1 : 1 + .3 * Math.sin((t - .6) / .4 * Math.PI);
      el.style.transform = `translate(${tx - 12}px,${yy}px) scale(${sc})`; if (++trail % 2 === 0) parts.push({ x: tx + 4, y: yy + 10, vx: rand(-20, 20), vy: -20, g: 0, c: P.rose, life: .3, s: 2 });
      if (t < 1) requestAnimationFrame(step); else { el.remove(); ok(); }
    })(t0);
  });
}

// ---------- 侧栏：白天放今晚来访预告，夜里放今晚的会话 ----------
export function drawer(open) {
  $('drawer').classList.toggle('on', open); $('scrim').classList.toggle('on', open); $('r-logo').classList.toggle('on', open);
  if (open) { SFX.launch(); renderDrawer(); document.querySelectorAll('#vlist .vc').forEach((d, i) => { d.classList.remove('in'); setTimeout(() => { d.classList.add('in'); SFX.step(i); }, 120 + i * 80); }); }
}
const avatarEl = (u, size = 48) => {
  const av = document.createElement('div'); av.className = 'av r2';
  if (u.dir && u.avatar) { const im = new Image(); im.src = `/剧本/${u.dir}/${u.avatar}`; im.onerror = () => { av.innerHTML = ''; av.appendChild(phAvatar(u.name)); }; av.appendChild(im); } else av.appendChild(phAvatar(u.name));
  return av;
};
let onPickSession = null;
export function setSessionPicker(fn) { onPickSession = fn; }
export function renderDrawer() {
  const night = G.mode === 'night';
  $('h-sess-t').textContent = night ? '今晚的会话' : '今晚来访预告'; $('dchip').textContent = `Day ${G.day}`; $('meday').textContent = `Day ${G.day}`; $('vdot').textContent = G.tonight.length;
  const box = $('vlist'); box.innerHTML = '';
  const list = night ? G.sessions : G.tonight;
  list.forEach((x, i) => {
    const u = night ? x.visitor : x, d = document.createElement('div'); d.className = 'vc r4 in' + (night && i === G.cur ? ' cur' : '');
    const st = night ? (x.status === 'live' ? ['进行中', 'live'] : x.status === 'done' ? [x.resultLabel || '已结束', 'done'] : ['排队中', '']) : [`第 ${i + 1} 位`, ''];
    d.innerHTML = `<div class="inf"><div class="nm"><span></span>${u.boss ? '<span class="badge b-boss r2">Boss</span>' : ''}${u.repeat ? '<span class="badge b-ph r2">占位 · 重复来访</span>' : ''}<span class="no ${st[1]}">${st[0]}</span></div><div class="bio"></div></div>`;
    d.prepend(avatarEl(u)); d.querySelector('.nm span').textContent = u.name; d.querySelector('.bio').textContent = u.bio || '';
    d.onmouseenter = () => SFX.hover();
    d.onclick = () => { SFX.click(); if (night && onPickSession) onPickSession(i); else { restart(d, 'shk'); toast(u.repeat ? `${u.name}：剧本不够，先让 ta 再来一次` : `${u.name}：今晚第 ${i + 1} 位上线`); } };
    box.appendChild(d);
  });
  renderQueue();
}
export function renderQueue() {
  const q = $('queue'); q.innerHTML = '';
  if (G.mode === 'night') G.sessions.forEach((s, i) => { const e = document.createElement('i'); e.className = 'r2' + (i === G.cur && s.status === 'live' ? ' cur' : s.status === 'done' ? (s.result === 'offline' || s.result === 'forced' ? ' lost' : ' done') : (s.visitor.boss ? ' boss' : '')); e.title = s.visitor.name; q.appendChild(e); });
  else G.tonight.forEach(u => { const e = document.createElement('i'); e.className = 'r2' + (u.boss ? ' boss' : ''); e.title = u.name; q.appendChild(e); });
}

// ---------- 确认框 ----------
export function confirmBox(q1, q2, yes = '确定') {
  return new Promise(ok => {
    $('mq1').textContent = q1; $('mq2').textContent = q2; $('myes').textContent = yes; $('modal').classList.add('on'); SFX.note();
    $('myes').onclick = () => { SFX.click(); $('modal').classList.remove('on'); ok(true); }; $('mno').onclick = () => { SFX.click(); $('modal').classList.remove('on'); ok(false); };
  });
}
// ---------- 像素抖动纹擦屏（白天 → 夜间从右往左擦成深色；第二天再擦回来） ----------
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
export function wipe(toDark, mid) {
  const c = $('wipe').getContext('2d'), cw = 4, cols = 240, rows = 135; SFX.wipe();
  return new Promise(ok => {
    const t0 = performance.now(), dur = 900;
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur); c.clearRect(0, 0, 960, 540); c.fillStyle = P.night;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const th = (BAYER[y & 3][x & 3] / 16) * .5 + (1 - x / cols) * .5; const on = toDark ? k > th : k < th; if (on) c.fillRect(x * cw, y * cw, cw, cw); }
      if (k < 1) requestAnimationFrame(step); else { if (!toDark) c.clearRect(0, 0, 960, 540); ok(); }
    })(t0);
  });
}
export function clearWipe() { $('wipe').getContext('2d').clearRect(0, 0, 960, 540); }

// ---------- 倍速滑杆（Codex 风格，白天夜里同一个） ----------
const TW = 208, KW = 20; let sPos = 1 / 3, sDrag = false;
function renderSpd(snap) {
  const k = $('sknob'), f = $('sfill'); k.classList.toggle('snap', !!snap); f.classList.toggle('snap', !!snap);
  const x = 1 + sPos * (TW - KW - 2); k.style.left = x + 'px'; f.style.width = (x + KW) + 'px';
  const n = SPEEDS[G.spd].n; $('spdname').textContent = n; $('spdlbl').textContent = n;
  $('spdpop').classList.toggle('ultra', G.spd === 3); $('spdchip').classList.toggle('ultra', G.spd === 3);
  [...$('sticks').children].forEach((s, i) => s.classList.toggle('on', i === G.spd));
}
function setTier(t) { const prev = G.spd; G.spd = t; if (t !== prev) { saveSettings(); SFX.tick(t / 3); if (t === 3) { SFX.ultra(); const p = sp($('sknob')); confetti(p.x + 10, p.y + 10, 26); } } }

// ---------- 按钮装配 ----------
export const on = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); SFX.click(); fn(e); });
export function closeMenus() { $('m-act').classList.remove('show'); $('spdpop').classList.remove('show'); }
export function initShell() {
  const ic = (id, k, col) => { const e = $(id); [...e.childNodes].filter(n => n.tagName === 'CANVAS').forEach(n => n.remove()); e.prepend(pxIcon(ICON[k], { k: col, B: P.cobalt, w: P.paper, I: P.ice })); };
  $('tlogo').appendChild(pxIcon(ICON.whale, { k: P.k0, B: P.cobalt, w: P.paper, I: P.ice }));
  $('dlogo').appendChild(pxIcon(ICON.whale, { k: P.k0, B: P.cobalt, w: P.paper, I: P.ice }, 2));
  ic('r-logo', 'whale', P.k0);
  [['r-new', 'plus'], ['r-sess', 'chat'], ['r-save', 'save'], ['r-set', 'gear'], ['r-me', 'user'], ['pn1', 'back'], ['pn2', 'fwd'], ['pn3', 'reload']].forEach(([id, k]) => ic(id, k, P.g2));
  $('meav').appendChild(pxIcon(ICON.user, { k: P.g2 })); $('send').appendChild(pxIcon(ICON.send, { k: P.paper }));
  $('pglobe').appendChild(pxIcon(ICON.globe, { k: P.g2 })); $('pglobe2').appendChild(pxIcon(ICON.chart, { k: P.g2 }));
  $('tibo-av').appendChild(pxIcon(TIBO, { k: P.ink, h: P.c1, s: P.skin, S: P.skinS, K: P.ink, M: P.g1, w: P.paper }, 2));
  ic('spdic2', 'bolt', P.lgold); ic('spdreset', 'reload', P.t3);
  const snd = () => ic('ic-snd', G.muted ? 'mute' : 'snd', P.g2); snd();
  on('ic-snd', () => { G.muted = !G.muted; snd(); toast(G.muted ? '已静音' : '声音已打开'); });
  on('wb-min', () => { restart(stage, 'squish'); toast('大肥鱼不能下班'); }); on('wb-max', () => toast('已经是最大了'));   // × 回到标题，在 主程序.js 装配
  on('r-logo', () => drawer(!$('drawer').classList.contains('on')));
  on('r-new', () => toast('今晚的用户由系统分配，不能自己开新会话'));
  on('r-sess', () => { drawer(true); restart($('h-sess'), 'shk'); }); on('queue', () => { drawer(true); restart($('h-sess'), 'shk'); });
  // 存档 / 读档按钮在 主程序.js 装配（要连到 日程.js 的读档）
  on('r-set', () => { drawer(true); restart($('h-set'), 'shk'); }); on('r-me', () => toast(`已登录 · 大肥鱼（Day ${G.day}）`));
  $('scrim').onclick = () => drawer(false);
  on('pn1', () => toast('没有上一页')); on('pn2', () => toast('没有下一页')); on('pn3', () => { restart($('desk'), 'reload'); toast('工位已刷新'); });
  on('t-plus', () => toast(G.mode === 'day' ? '上传图片：她还没学过视觉' : '输入框是用户的'));
  on('send', () => toast(G.mode === 'day' ? '点输入框，选一件让她去做的事' : '输入框是用户的，大肥鱼只管回答'));
  $('phone-x').onclick = () => { $('phone').classList.remove('show'); SFX.click(); };
  $('slogan').addEventListener('click', sloganClick);
  // 设置：音量（侧栏和标题画面各有一组滑杆，data-k 指向 G 里的字段；记在本机）
  document.querySelectorAll('.vol[data-k]').forEach(el => { const key = el.dataset.k; const set = e => { const r = el.getBoundingClientRect(); G[key] = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); renderSettings(); if (key === 'vSfx') setSfxVolume(G.vSfx); };
    el.addEventListener('pointerdown', e => { e.stopPropagation(); el.setPointerCapture(e.pointerId); set(e); el.onpointermove = set; }); el.addEventListener('pointerup', () => { el.onpointermove = null; SFX.click(); saveSettings(); }); });
  renderSettings();
  // 倍速
  const st = $('sfill').querySelector('.stars'); for (let i = 0; i < 34; i++) { const s = document.createElement('i'); s.style.left = (Math.random() * 260 | 0) + 'px'; s.style.top = (2 + Math.random() * 18 | 0) + 'px'; s.style.animationDelay = (-Math.random() * 2.4) + 's'; st.appendChild(s); }
  const trk = $('strack');
  const move = e => { const r = trk.getBoundingClientRect(); sPos = Math.max(0, Math.min(1, ((e.clientX - r.left) / r.width * TW - 1 - KW / 2) / (TW - KW - 2))); setTier(Math.round(sPos * 3)); renderSpd(false); };
  trk.addEventListener('pointerdown', e => { e.stopPropagation(); trk.setPointerCapture(e.pointerId); sDrag = true; move(e); });
  trk.addEventListener('pointermove', e => { if (sDrag) move(e); });
  trk.addEventListener('pointerup', () => { if (!sDrag) return; sDrag = false; sPos = G.spd / 3; renderSpd(true); SFX.click(); });
  on('spdreset', () => { setTier(1); sPos = 1 / 3; renderSpd(true); toast('倍速已恢复 Medium'); });
  on('spdchip', () => { $('m-act').classList.remove('show'); $('spdpop').classList.toggle('show'); renderSpd(true); });
  $('spdpop').addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', e => { if (!e.target.closest('.menu')) $('m-act').classList.remove('show'); if (!e.target.closest('#spdpop')) $('spdpop').classList.remove('show'); });
  sPos = G.spd / 3; renderSpd(true);
}
// 墙上的标语：点一下横着跑马灯（一行一行读，不知所云），再点一下竖着跑（一列一列读出真意），再点一下停
const SLOGAN = { 1: { order: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], say: '横着读：不挑战 · 怕战胜 · 困困困 · 难难难' }, 2: { order: [0, 3, 6, 9, 1, 4, 7, 10, 2, 5, 8, 11], say: '竖着读：不怕困难 · 挑战困难 · 战胜困难' } };
let sloganMode = 0, sloganTimer = 0, sloganStep = 0;
function sloganClick() {
  sloganMode = (sloganMode + 1) % 3; clearInterval(sloganTimer); sloganStep = 0;
  const spans = [...$('slogan').children];
  spans.forEach(x => x.style.color = '');
  if (!sloganMode) { SFX.click(); toast('标语停下了'); return; }
  SFX.good(); toast(SLOGAN[sloganMode].say);
  const order = SLOGAN[sloganMode].order;
  // 像 RGB 键盘：一道彩虹顺着读的方向流过去，只改字的颜色
  sloganTimer = setInterval(() => {
    const L = document.body.classList.contains('night') ? 80 : 46;
    order.forEach((i, k) => spans[i].style.color = `hsl(${(k * 30 - sloganStep * 18 + 3600) % 360},95%,${L}%)`);
    if (sloganStep % 8 === 0) SFX.step(sloganStep / 8 % 3);
    sloganStep++;
  }, 80);
}
export function renderSettings() {
  document.querySelectorAll('.vol[data-k]').forEach(el => { const v = G[el.dataset.k]; el.firstChild.style.width = v * 100 + '%'; el.nextElementSibling.textContent = Math.round(v * 100); });
}
