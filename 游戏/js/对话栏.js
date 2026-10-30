// 对话栏：白天是你和大肥鱼的 LINE 式聊天；夜里一位用户一个会话，大肥鱼的思考和正文是 token，从分词机飞进来。
import { G, spd } from './状态.js';
import { P, $, sp, wait, wt, rand, fmt, restart, pxIcon, ICON, DOWN, tokenize, toast, phAvatar, mdRender, deskXY, DESK_DY } from './基础.js';
import { SFX } from './音频.js';
import { parts, ring } from './特效.js';
import { DEV, MON, scrToken, fishAvatar, setFish, mouth, MOUTH, fishImg } from './工位.js';

const box = $('msgs');
let CUR = null;                       // 正在往里写的会话
export const curConv = () => CUR;
// 新建一个会话（白天一天一个，夜里一位用户一个）
export function newConv() { const d = document.createElement('div'); d.className = 'conv hide'; box.appendChild(d); return d; }
export function showConv(conv, slide) {
  box.querySelectorAll('.conv').forEach(c => c.classList.toggle('hide', c !== conv));
  if (slide) restart(conv, 'slide');
  conv.scrollTop = conv.scrollHeight;
}
export function writeTo(conv) { CUR = conv; }
export function clearConvs() { box.innerHTML = ''; CUR = null; }
export function scrollChat() { if (CUR) CUR.scrollTop = CUR.scrollHeight; }
let ANCHOR = null;   // 不为空时，积木产生的通知 / 错误卡插在它前面（大肥鱼消息里、正文之前）
export function setAnchor(el) { ANCHOR = el; }
function place(d) { if (ANCHOR && ANCHOR.isConnected) ANCHOR.before(d); else CUR.appendChild(d); }

// ---------- 通用 ----------
export function addNote(t, k = '') { const d = document.createElement('div'); d.className = 'note pop ' + k; d.innerHTML = '<i></i>'; d.append(t); place(d); scrollChat(); SFX.note(); addTrace(t, k); return d; }
export function addErr(t) { const d = document.createElement('div'); d.className = 'errc r4 pop'; d.innerHTML = '<b class="r2">!</b><span></span>'; d.lastChild.textContent = t; place(d); scrollChat(); SFX.bad(); return d; }
function copyIcon(col) { const c = pxIcon(ICON.copy, { k: col }); c.className = 'ic r2'; c.onclick = () => toast('已复制'); return c; }
// 轨迹：这一局发生过的事，按天分段。对话栏的「轨迹」标签里看
export const TRACE = [];
export function addTrace(t, k = '') { TRACE.push({ day: G.day, mode: G.mode, tm: fmt(G.clock), t, k }); if (TRACE.length > 600) TRACE.shift(); if ($('chat').classList.contains('tr')) renderTrace(); }
// 游戏记录（白天做了什么、训练结果）：只进轨迹，不混进聊天；标签上亮一个小点提示
export function addLog(t, k = '') { addTrace(t, k); SFX.note(); if (!$('chat').classList.contains('tr')) $('tdot').classList.add('on'); }
export function renderTrace() {
  const tr = $('trace'); tr.innerHTML = ''; if (!TRACE.length) { tr.innerHTML = '<div class="t3">还没有记录。</div>'; return; }
  let key = null;
  for (const e of TRACE) {
    if (e.day + e.mode !== key) { key = e.day + e.mode; const s = document.createElement('div'); s.className = 'trow sep'; s.textContent = `—— 第 ${e.day} 天 · ${e.mode === 'day' ? '白天' : '夜间'} ——`; tr.appendChild(s); }
    const r = document.createElement('div'); r.className = 'trow ' + e.k; r.innerHTML = '<span class="tm"></span><span></span>'; r.firstChild.textContent = e.tm; r.lastChild.textContent = e.t; tr.appendChild(r);
  }
  tr.scrollTop = tr.scrollHeight;
}
export function chatTab(t) { document.querySelectorAll('#tabs span').forEach(x => x.classList.toggle('on', x.dataset.t === t)); $('chat').classList.toggle('tr', t === 'trace'); if (t === 'trace') { $('tdot').classList.remove('on'); renderTrace(); } }

// ---------- 输入框（夜里归用户，白天归你） ----------
const inp = $('inp');
export function setInp(t, cursor = true) {
  const ph = G.mode === 'day' ? '和大肥鱼说点什么…' : '发消息给 大肥鱼';
  inp.classList.toggle('ph', !t && !cursor); inp.textContent = t || (cursor ? '' : ph);
  if (cursor) { const c = document.createElement('span'); c.className = 'cur'; inp.appendChild(c); }
  $('send').classList.toggle('ready', !!t);
}
async function pressSend() { $('send').classList.add('press'); SFX.send(); const s0 = sp($('send')); ring(s0.x + 11, s0.y + 11, P.cobalt, 14, 70); await wait(110); $('send').classList.remove('press'); }

// ======================= 夜间：用户 ↔ 大肥鱼 =======================
export function addUser(t) {
  const d = document.createElement('div'); d.className = 'um pop';
  const b = document.createElement('div'); b.className = 'ub r12'; b.textContent = t;
  const m = document.createElement('div'); m.className = 'meta'; m.append(fmt(G.clock), copyIcon(P.t3));
  d.append(b, m); CUR.appendChild(d); scrollChat(); return d;
}
export function addAI() {
  const d = document.createElement('div'); d.className = 'ai pop';
  d.innerHTML = '<div class="th"><div class="hd">思考中<span class="dots"><i></i><i></i><i></i></span></div><div class="bd"><span class="caret"></span></div></div><div class="sep"></div><div class="txt"><span class="caret"></span></div><div class="acts"></div>';
  const th = d.querySelector('.th'); th.querySelector('.hd').onclick = () => { if (th.classList.contains('done')) { th.classList.toggle('closed'); SFX.click(); } };
  const acts = d.querySelector('.acts'); const up = pxIcon(ICON.up, { k: P.t2 }), dn = pxIcon(DOWN, { k: P.t2 }); up.className = dn.className = 'ic r2';
  up.onclick = dn.onclick = () => toast('评价按钮是留给用户的');
  const shr = pxIcon(ICON.share, { k: P.t2 }); shr.className = 'ic r2'; shr.onclick = () => toast('分享链接已生成（假的）');
  acts.append(copyIcon(P.t2), up, dn, shr); const use = document.createElement('span'); acts.append(use);
  CUR.appendChild(d); scrollChat();
  return { d, th, thCaret: th.querySelector('.caret'), txtCaret: d.querySelector('.txt .caret'), up, dn, use, t0: performance.now() };
}
export function finishThink(a) { const s = Math.max(1, Math.round((performance.now() - a.t0) / 1000)); a.th.classList.add('done', 'closed'); a.th.querySelector('.hd').textContent = `已完成，用时 ${s} 秒 ›`; a.d.classList.add('out'); }
export function addTool(a, html) { const d = document.createElement('div'); d.className = 'tool r4'; d.innerHTML = '<span class="tt">运行了命令 · Bash</span><pre></pre>'; d.querySelector('pre').innerHTML = html; a.d.insertBefore(d, a.d.querySelector('.txt')); scrollChat(); }
export function renderReply(a, c, dir) {
  const t = a.d.querySelector('.txt'); t.classList.add('md'); t.innerHTML = mdRender(c.reply);
  if (c.attachment) { const im = new Image(); im.className = 'att'; im.src = c.attachment.startsWith('/') ? c.attachment : `/剧本/${dir}/${c.attachment}`; t.appendChild(im); }
  scrollChat();
}
// 用户在输入框里打字，节奏透出情绪（正常 / 飞快 / 打了又删 / 整段粘贴）
export async function userType(text, rhythm) {
  const base = rhythm === 'fast' ? 30 : 70; let cur = ''; setInp(''); await wait(250 / spd());
  const typeOut = async (t, ms) => { for (const ch of t) { cur += ch; setInp(cur); SFX.type(); await wait(ms * rand(.6, 1.4) / spd()); } };
  if (rhythm === 'paste') { cur = text; setInp(cur); SFX.chunk(); await wait(300 / spd()); }
  else if (rhythm === 'hesitant') {
    await typeOut(text.slice(0, 5), 110); await wait(600 / spd());
    for (let i = 0; i < 3; i++) { cur = cur.slice(0, -1); setInp(cur); SFX.type(); await wait(90 / spd()); } await wait(400 / spd()); await typeOut(text.slice(cur.length), 95);
  } else await typeOut(text, base);
  await wait(280 / spd()); await pressSend();
  setInp('', false); addUser(text); await wait(300 / spd());
}

// ---------- token：从分词机飞进对话栏 ----------
const emitQ = []; let emitAcc = 0; export const flights = [];
export function emit(text, caret, opts = {}) {
  return new Promise(res => {
    const toks = tokenize(text); if (!toks.length) return res();
    const grp = { left: toks.length, res };
    toks.forEach((t, i) => emitQ.push({ text: t, caret, grp, ...opts, last: i === toks.length - 1 }));
  });
}
function devPoint() { const d = sp($('desk')); return { x: d.x + DEV.x + DEV.w / 2 - 10 + rand(-6, 6), y: d.y + DEV.y + 2 }; }
function launchToken(q) {
  const span = document.createElement('span'); span.className = 'rs' + (q.text.includes('\n') ? '' : ' ib'); span.textContent = q.text; q.caret.before(span); scrollChat();
  const el = document.createElement('div'); el.className = 'fly r2' + (q.reply ? ' rp' : ''); el.textContent = q.text.replace(/\n/g, '⏎'); $('fxl').appendChild(el);
  const p0 = devPoint();
  flights.push({ kind: 'tok', el, span, q, p0, t: -rand(.06, .12), dur: rand(820, 1080) / Math.sqrt(spd()), c1: { x: rand(-90, 10), y: rand(-190, -110) }, c2: { x: rand(40, 140), y: rand(-80, -20) }, wob: rand(2, 5), wf: rand(1.5, 3), trailT: 0 });
  G.glow = 1; G.tok++; DEV.glow = 1; DEV.flash = 1; DEV.kick = 1; SFX.key(); SFX.chunk(); scrToken();
  for (let k = 0; k < 3; k++) parts.push({ x: p0.x + rand(0, 20), y: p0.y + 8, vx: rand(-30, 30), vy: rand(-60, -20), g: 120, c: P.cyan, life: .3, s: 1 });
  if (q.last && q.onLaunch) q.onLaunch();
}
// 白天预训练：语料里的词从显示器飞进她脑袋
export function flyWord(text, col) {
  const el = document.createElement('div'); el.className = 'fly word r2'; el.textContent = text; el.style.color = col; $('fxl').appendChild(el);
  const a = deskXY(MON.x + 20 + rand(0, 110), MON.y + 20 + rand(0, 50)), b = deskXY(96 + rand(-14, 14), 246 + DESK_DY + rand(-10, 10));
  flights.push({ kind: 'word', el, a, b, col, c1: { x: a.x + rand(-30, 20), y: a.y - rand(80, 140) }, c2: { x: b.x + rand(10, 60), y: b.y - rand(60, 110) }, t: 0, dur: rand(.6, .9) * 1000 / spd(), trailT: 0 });
}
const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
export function flightsUpdate(dt) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i]; f.t += dt * 1000 / f.dur * (f.kind === 'tok' ? G.timeScale : 1); let x, y, s;
    if (f.kind === 'word') {
      const t = Math.min(1, f.t), e = t * t * (3 - 2 * t); x = bez(f.a.x, f.c1.x, f.c2.x, f.b.x, e); y = bez(f.a.y, f.c1.y, f.c2.y, f.b.y, e); s = 1.3 - .8 * e;
      f.trailT += dt; if (f.trailT > .025) { f.trailT = 0; parts.push({ x: x + 4, y: y + 8, vx: 0, vy: 0, g: 0, c: f.col, life: .25, s: 2 }); }
      if (t >= 1) { f.el.remove(); flights.splice(i, 1); for (let k = 0; k < 6; k++) parts.push({ x, y, vx: rand(-60, 60), vy: rand(-80, -10), g: 200, c: Math.random() < .4 ? P.paper : f.col, life: .35, s: 2 }); continue; }
    } else if (f.t < 0) { const k = (f.t + .12) / .12; x = f.p0.x; y = f.p0.y + 4 - k * 4; s = .2 + k * 1.1; }
    else {
      const t = Math.min(1, f.t), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, p3 = sp(f.span), P3 = { x: p3.x - 3, y: p3.y };
      const C1 = { x: f.p0.x + f.c1.x, y: f.p0.y + f.c1.y }, C2 = { x: P3.x + f.c2.x, y: P3.y + f.c2.y };
      x = bez(f.p0.x, C1.x, C2.x, P3.x, e); y = bez(f.p0.y, C1.y, C2.y, P3.y, e); y += Math.sin(t * Math.PI * f.wf) * f.wob * (1 - t); s = 1.2 - .3 * t;
      f.trailT += dt; if (f.trailT > .02 && t < .95) { f.trailT = 0; parts.push({ x: x + 2, y: y + 8, vx: 0, vy: 0, g: 0, c: f.q.reply ? P.sky : P.t3, life: .26, s: 1 }); }
      if (f.t >= 1) {
        f.el.remove(); f.span.classList.add('on'); SFX.land(); const p = sp(f.span); for (let k = 0; k < 5; k++) parts.push({ x: p.x + rand(0, p.w), y: p.y + 8, vx: rand(-40, 40), vy: rand(-60, -10), g: 220, c: f.q.reply ? P.cyan : P.t2, life: .32, s: 1 });
        if (--f.q.grp.left === 0) f.q.grp.res(); flights.splice(i, 1); continue;
      }
    }
    f.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) scale(${s.toFixed(2)})`;
  }
  G.outBusy = flights.some(f => f.kind === 'tok') || emitQ.length > 0;
}
export function emitUpdate(dt) {
  emitAcc += dt * 1000 * G.timeScale; const iv = 95 / spd();
  while (emitQ.length && emitAcc >= iv) { emitAcc -= iv; launchToken(emitQ.shift()); }
  if (!emitQ.length) emitAcc = Math.min(emitAcc, iv);
}
export function clearFlights() { emitQ.length = 0; flights.forEach(f => f.el.remove()); flights.length = 0; }

// ======================= 白天：你 ↔ 大肥鱼（像 LINE） =======================
let lastRead = null;
function addLine(t) {
  const d = document.createElement('div'); d.className = 'lu pop';
  const m = document.createElement('div'); m.className = 'meta'; m.innerHTML = '<span class="rd"></span>'; m.append(fmt(G.clock));
  const w = document.createElement('div'); w.className = 'bw'; w.innerHTML = '<i class="tl"></i>';
  const b = document.createElement('div'); b.className = 'lub r12'; b.textContent = t; w.appendChild(b);
  d.append(m, w); CUR.appendChild(d); scrollChat(); lastRead = m.querySelector('.rd'); return d;
}
// 你在输入框里打字、发送
export async function youSay(text) {
  let cur = ''; setInp(''); await wt(120);
  for (const ch of text) { cur += ch; setInp(cur); SFX.type(); await wt(rand(26, 50)); }
  await wt(160); await pressSend(); setInp('', false); addLine(text); await wt(220);
}
function addFish() {
  const d = document.createElement('div'); d.className = 'fm pop';
  d.innerHTML = '<div class="fav r2"></div><div class="col"><div class="who">大肥鱼</div><div class="row"><div class="bw"><i class="tl"></i><div class="fb r12"></div></div><div class="meta"></div></div></div>';
  d.querySelector('.fav').appendChild(fishAvatar()); CUR.appendChild(d); scrollChat(); return d;
}
// 先冒「正在输入」，再一个字一个字蹦出来，每个字一声发音，她的嘴一张一合
export async function fishSay(text) {
  if (lastRead) { lastRead.textContent = '已读'; lastRead = null; }
  const d = addFish(), fb = d.querySelector('.fb'); fb.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; SFX.blip(); await wt(420);
  fb.textContent = ''; talk(true);
  for (const ch of text) {
    const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; fb.appendChild(s); scrollChat();
    if (/[，。！？、…—～「」!?,.\s]/.test(ch)) { mouth(false); await wt(90); }
    else { SFX.voice(); mouth(!MOUTH.open); await wt(46); }
  }
  talk(false); fb.textContent = text; d.querySelector('.row .meta').textContent = fmt(G.clock); scrollChat();
}
function talk(on) { if (on) { if (fishImg.className === 'idle' || fishImg.className === 'pick') setFish('talk'); } else { mouth(false); if (fishImg.className === 'talk') setFish('idle'); } }
// 鱼图加载完后，把已经画出来的头像补上
export function refreshFishAvatars() { $('uav').innerHTML = ''; if (G.mode === 'day') $('uav').appendChild(fishAvatar()); document.querySelectorAll('.fm .fav').forEach(e => { e.innerHTML = ''; e.appendChild(fishAvatar()); }); }

// ======================= 标题栏和状态栏 =======================
export function headerDay() {
  $('uav').innerHTML = ''; $('uav').dataset.k = ''; $('uav').appendChild(fishAvatar()); $('uname').textContent = '大肥鱼'; $('uchip').textContent = '在线 · 白天'; $('ubio').textContent = '';
}
// 夜里：当前用户（或这一轮的说话人覆盖）
export function headerUser(sess, speaker) {
  const u = sess.user, av = $('uav'), src = speaker?.avatar || u.avatar, key = sess.dir + '/' + (src || '');
  if (av.dataset.k !== key || !av.firstChild) {
    av.dataset.k = key; av.innerHTML = '';
    if (src) { const im = new Image(); im.onerror = () => { av.innerHTML = ''; av.appendChild(phAvatar(u.name, 1)); }; im.src = `/剧本/${key}`; av.appendChild(im); }
    else av.appendChild(phAvatar(u.name, 1));
  }
  $('uname').textContent = speaker?.name || u.name; $('uchip').textContent = sess.qtype || ''; $('ubio').textContent = u.bio || '';
}
export function nightBar(N) {
  $('pfill').style.width = G.patience + '%'; $('pfill').style.background = G.patience > 50 ? P.mint : G.patience > 25 ? P.gold : P.red;
  $('sprog').textContent = `推进 ${G.prog}/${N}`; $('sturn').textContent = `重问 ×${G.retry || 0}`; $('sturn').style.color = G.retry ? P.lgold : P.g1;
}
