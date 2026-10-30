// 开发者模式（不属于设计）：正常游戏里同时按住 2+5+9 打开 / 关上，开着的状态记在本机；开着时标题栏挂一个「DEV」。
// 面板是左上角的 #dev：数值、属性阶段、后训练权重分都能直接改，能跳过新手教程、跳过当前用户、去第几天、马上营业、改剧情变量、叫一次 Tibo 重置。
// 编辑器打开的试玩、预览里没有（initDev 的 allowed = false）。开发者模式不碰存档和成就。
// 白天按数字选活动改成「松开才算」：按住期间又按了别的数字就当组合键，不选（不然按 2+5+9 时 2 先把第 2 个活动选了）。
import { G, QT, AXES } from './状态.js';
import { $, AT, toast } from './基础.js';
import { NODE } from './转盘.js';
import { drawRoomItems } from './工位.js';
import { renderHUD, renderAP, renderClock, tibo } from './界面.js';
import { view, goNight, pickActByIndex } from './白天.js';
import { skipCurrent, devSkipTutorial, devGoDay } from './日程.js';
import { renderSelf } from './报告.js';
import { w } from './训练.js';
import { DATA } from './数据.js';

const KEY = 'dafeiyu-dev';
const CHORD = ['2', '5', '9'];
let ALLOWED = false, ON = false, BUILT = false;
const lsGet = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const lsSet = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { } };

export function initDev(allowed) {
  ALLOWED = allowed; addEventListener('keydown', keyDown, true); addEventListener('keyup', keyUp, true);
  $('devh').onclick = () => $('dev').classList.toggle('min');
  setOn(allowed && lsGet(), false);
}
function setOn(on, say = true) {
  ON = on; $('dev').style.display = on ? '' : 'none'; $('devtag').style.display = on ? '' : 'none';
  if (on && !BUILT) build();
  if (say) toast(on ? '开发者模式：开（再按一次 2+5+9 关掉）' : '开发者模式：关');
}

// ---------- 按键：2+5+9 组合键；白天的数字键松开才选活动 ----------
const HELD = new Set(); let COMBO = false, PEND = null;
const digitOf = e => /^(Digit|Numpad)[0-9]$/.test(e.code) ? e.code.slice(-1) : null;
function keyDown(e) {
  const d = digitOf(e); if (!d || e.repeat) return;
  HELD.add(d); if (HELD.size > 1) COMBO = true;
  if (ALLOWED && CHORD.every(k => HELD.has(k))) { PEND = null; setOn(!ON); lsSet(ON); }
}
function keyUp(e) {
  const d = digitOf(e); if (!d) return;
  if (PEND && PEND.code === e.code && !COMBO) pickActByIndex(PEND.i);
  if (PEND && PEND.code === e.code) PEND = null;
  HELD.delete(d); if (!HELD.size) COMBO = false;
}
// 主程序.js 的 keydown 走到「白天选活动」这一步时记下来，等松开再选
export const pendDigit = (code, i) => { PEND = { code, i }; };

// ---------- 面板 ----------
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) if (k.startsWith('on')) e[k] = v; else if (v != null) e.setAttribute(k, v); for (const c of kids.flat()) if (c != null) e.append(c); return e; };
const refreshDay = () => { if (G.mode === 'day' && !G.busy) view('menu'); };
const num = (get, set, { min = 0, step = 1 } = {}) => { const e = h('input', { type: 'number', min, step }); e.oninput = () => { const v = parseFloat(e.value); if (!isNaN(v)) set(v); }; e._get = get; return e; };
const BINDS = [];   // [input, get]：每次刷新时把没在改的输入框换成现在的值
const bind = e => { BINDS.push(e); return e; };
const clockGet = () => `${String(G.clock / 60 | 0).padStart(2, '0')}:${String(G.clock % 60).padStart(2, '0')}`;
function build() {
  BUILT = true; const body = $('devbody'); body.replaceChildren();
  const sec = (t, ...kids) => body.append(h('h5', {}, t), h('div', { class: 'drow' }, ...kids));
  const lab = (t, e) => h('label', {}, t, e);
  sec('数值（改了马上生效）',
    lab('心', bind(num(() => G.hearts, v => { G.hearts = v | 0; G.heartMax = Math.max(G.heartMax, G.hearts); renderHUD(); }))),
    lab('额度', bind(num(() => G.quota, v => { G.quota = v | 0; G.quotaMax = Math.max(G.quotaMax, G.quota); renderHUD(); }))),
    lab('行动点', bind(num(() => G.ap, v => { G.ap = v | 0; G.apMax = Math.max(G.apMax, G.ap); renderAP(); refreshDay(); }))),
    lab('回档', bind(num(() => G.rollbacks, v => { G.rollbacks = v | 0; }))),
    lab('钟点', bind(Object.assign(h('input', { type: 'time' }), { _get: clockGet, oninput: e => { const [hh, mm] = e.target.value.split(':').map(Number); if (!isNaN(hh)) { G.clock = hh * 60 + (mm || 0); renderClock(); } } }))));
  sec('预训练阶段', ...AXES.map(a => { const s = h('select', {}, ...['未解锁', '浅层', '深层'].map((t, i) => h('option', { value: i }, t)));
    s._get = () => G.stage[a] || 0; s.onchange = () => setStage(a, +s.value); return lab(AT[a].s, bind(s)); }),
    h('button', { onclick: () => AXES.forEach(a => setStage(a, 1)) }, '全部浅层'), h('button', { onclick: () => AXES.forEach(a => setStage(a, 2)) }, '全部深层'));
  body.append(h('h5', {}, '后训练权重分（每个问题类型一列，直接填数）'), h('table', { id: 'devtab' }));
  const day = h('input', { type: 'number', min: 1, value: 2 });
  sec('流程',
    h('button', { onclick: () => devSkipTutorial() }, '跳过新手教程（重开，从第 1 天开始）'),
    h('button', { onclick: () => skipCurrent() }, '跳过当前用户'),
    h('button', { onclick: () => { G.ap = G.apMax; G.post = 0; renderAP(); refreshDay(); } }, '行动点回满'),
    h('button', { onclick: () => { if (G.mode !== 'day') return toast('白天才能开始营业'); G.busy = false; goNight({ ask: false }); } }, '马上开始营业'),
    h('span', {}, '去第 ', day, ' 天 ', h('button', { onclick: () => { const n = parseInt(day.value); if (!DATA.sched.days.some(d => d.day === n)) return toast('日程表里没有第 ' + n + ' 天'); devGoDay(n); } }, '去')));
  body.append(h('h5', {}, '剧情变量（这一局的）'), h('div', { id: 'devvars' }));
  sec('彩蛋', h('button', { onclick: () => { G.tiboUsed = false; tibo(); } }, '马上触发一次 Tibo 重置'));
  body.append(h('h5', {}, '状态'), h('pre', { id: 'devstate' }));
  TAB = null; VARS = null;
}
function setStage(a, v) {
  const prev = G.stage[a] || 0; if (prev === v) return;
  G.stage[a] = v; if (a === 'open' && prev === 0) G.adj = RULES.afterLearn(G.adj, a, 0);
  drawRoomItems(); renderSelf(); refreshDay();
}
// 权重分表：格子里是这一类问题下这个属性现在的分；填一个数，就把后训练的调整改成刚好得到这个分
let TAB = null;
function table() {
  const key = QT.join() + '|' + AXES.map(a => G.stage[a] || 0).join();
  const t = $('devtab'); if (!t) return;
  if (TAB !== key) {
    TAB = key; t.replaceChildren(h('tr', {}, h('td'), ...QT.map(q => h('td', {}, q.slice(0, 2)))));
    for (const a of AXES) t.append(h('tr', {}, h('td', {}, h('span', { style: `color:${AT[a].c}` }, '■ '), AT[a].s + (G.stage[a] === 2 ? '·深' : '')),
      ...QT.map(q => { if (w(q, a) == null) return h('td', {}, '—'); const e = h('input', { type: 'number', step: .1, class: 'wcell' });
        e._get = () => { const v = w(q, a); return v == null ? '' : v.toFixed(2); };
        e.onchange = () => { const v = parseFloat(e.value); if (isNaN(v)) return; const base = RULES.attrWeight(a, G.stage[a] || 0, DATA.reg, {}); (G.adj[q] ||= {})[a] = v - base; renderSelf(); };
        return h('td', {}, bind(e)); })));
  }
}
// 剧情变量：一个变量一行，值能改；最下面一行新加一个
let VARS = null;
const parseVal = v => v === 'true' ? true : v === 'false' ? false : v.trim() !== '' && !isNaN(v) ? Number(v) : v;
function vars() {
  const box = $('devvars'); if (!box || !G.story) return;
  const names = Object.keys(G.story.vars), key = names.join('|'); if (VARS === key) return; VARS = key;
  box.replaceChildren(...names.map(n => { const e = h('input', { type: 'text' }); e._get = () => String(G.story.vars[n]); e.onchange = () => { G.story.vars[n] = parseVal(e.value); }; return h('div', { class: 'drow' }, h('span', {}, n + ' = '), bind(e), h('button', { onclick: () => { delete G.story.vars[n]; } }, '✕')); }));
  const nm = h('input', { type: 'text', placeholder: '变量名' }), vl = h('input', { type: 'text', placeholder: '值' });
  box.append(h('div', { class: 'drow' }, nm, vl, h('button', { onclick: () => { if (!nm.value.trim()) return; G.story.vars[nm.value.trim()] = parseVal(vl.value); } }, '＋ 加')));
  if (!names.length) box.prepend(h('div', { class: 't' }, '这一局还没有剧情变量'));
}

// 主循环每隔几帧调一次：只刷新没在改的输入框
export function devRender() {
  if (!ON || $('dev').classList.contains('min')) return;
  table(); vars();
  for (let i = BINDS.length - 1; i >= 0; i--) { const e = BINDS[i]; if (!e.isConnected) { BINDS.splice(i, 1); continue; } if (document.activeElement !== e) { const v = String(e._get()); if (e.value !== v) e.value = v; } }
  const s = G.sessions[G.cur];
  $('devstate').textContent = `Day ${G.day} · ${G.mode} · 行动点 ${G.ap}/${G.apMax} · 心 ${G.hearts} · 额度 ${G.quota}\n` +
    (s ? `会话 ${G.cur + 1}/${G.sessions.length}：${s.visitor.name} · ${s.file}\n耐心 ${G.patience} · 推进 ${G.prog}/${s.U.N} · 重问 ${G.retry} · 节点 ${NODE.state}` : `今晚：${(G.tonight || []).map(v => v.name + (v.repeat ? '(重复)' : '')).join('、')}`) +
    `\n题库：${DATA.bankFake ? '假题（正式题库还没写）' : '正式题库'}`;
}
