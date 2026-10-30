// 游戏剧情（游戏剧情_设计.md）：剧情段挂在挂点上，挂点到了就 hook(挂点, 参数)，把满足条件的剧情段按优先级依次播完。
//   一段 = 几个节点，从 start（不写就是第一个）开始；一个节点 = 一串积木，走完接 next（不写就结束），选项 / 条件跳转 / 跳到某节点能改道。
//   画面积木（全屏对白、黑屏字幕、插画、淡入淡出、选项）演在 #vn 这一层；
//   其余积木（通知、大肥鱼说一句、画面故障、显示器、假手机……）演在窗口里面，这时 #vn 收起来，玩家看得到 HARNESS。
//   玩家能做的：点击 / 空格 / Enter 下一句；按住 Ctrl 快进；A 自动；L 或滚轮往上回看；跳过 = 已读的一路跳过，停在没读过的地方和选项上。
//   「已读」跨局记在本机（存档.js 的 readSeen）；挑哪几段播、条件怎么算在 规则.js（storyPick / storyCond）。
//   改状态积木只改这一局（G.story 和 G 里的数值），不改日程表文件；进结局 / 心被扣光时交给 日程.js 收尾（HANDLERS.end）。
//   事件挂点用 fire()：不在对话中间就马上播；在对话中间，勾了「立即」的马上播，其余排队，等这位用户的对话结束（flushEvents）。
import { G, SPEEDS, spd } from './状态.js';
import { $, P, AT, wait, restart, toast } from './基础.js';
import { SFX } from './音频.js';
import { flash, shake, vignette, glitch } from './特效.js';
import { FISH, drawRoomItems } from './工位.js';
import { learn } from './训练.js';
import { newConv, showConv, writeTo, curConv, youSay, fishSay } from './对话栏.js';
import { phonePost, wiping, renderHUD, renderAP } from './界面.js';
import { runFx, lineOf } from './夜间.js';
import { DATA, regName, showById } from './数据.js';
import { readSeen, readMark } from './存档.js';

const RULES = window.RULES;
const vn = $('vn');
// 播放状态。gen：每开一段 +1，中途回标题时旧的一段发现自己过期就停
const S = { on: false, gen: 0, seg: null, typing: false, full: false, adv: null, auto: false, fast: false, ctrl: false, skip: false, log: [], cast: new Map(), pick: null, endReq: null };
// 日程.js 装上的两个口子：end(结局编号 / 'hearts') 收尾整局；slot(第几位) 白天改了今晚的来客位时换掉预告里那一位
export const HANDLERS = { end: null, slot: null };
export const storyPlaying = () => S.on;
const quick = () => S.fast || S.ctrl || S.skip;

// 这一局给 规则.js 看的状态
export const storyState = () => ({ day: G.day, hearts: G.hearts, quota: G.quota, ap: G.ap, rollbacks: G.rollbacks, stage: G.stage,
  vars: G.story.vars, ach: [...(G.achievements || [])], played: G.story.played });

// 挂点到了：返回播了几段。剧情编辑器的单场试玩、演出预览不放剧情
const pick = (at, params) => G.noSave || !DATA.story?.segs?.length ? [] : RULES.storyPick(DATA.story.segs, { at, ...params }, storyState());
export async function hook(at, params = {}) { const list = pick(at, params); await playList(list, at); return list.length; }
async function playList(list, at) {
  for (const g of list) { const my = S.gen; await play(g); if (S.gen !== my + 1) return; if (S.endReq) break; }   // 中途被打断就不播后面的了
  // 剧情进了结局（或把心扣光了）：交给 日程.js 收尾，这里的流程到此为止（返回一个永远不结束的 Promise，调用的地方不再往下走）
  if (S.endReq && at !== 'ending') { const k = S.endReq; S.endReq = null; HANDLERS.end?.(k); return new Promise(() => { }); }
  S.endReq = null;
}

// ---------- 事件挂点 ----------
const QUEUE = [];   // 对话中间发生的事件，等这位用户的对话结束再播：{at, params, except: 已经立即播过的剧情段}
const inConv = () => G.mode === 'night' && G.sessions[G.cur]?.status === 'live';
// defer：触发的地方停不下来（比如额度飞格子的回调里），「立即」也只能排队
export async function fire(at, params = {}, { defer = false } = {}) {
  const list = pick(at, params); if (!list.length) return;
  if (!inConv()) return playList(list, at);
  const now = defer ? [] : list.filter(g => g.now);
  if (now.length < list.length) QUEUE.push({ at, params, except: now.map(g => g.id) });
  return playList(now, at);
}
export async function flushEvents() {
  while (QUEUE.length) { const q = QUEUE.shift(); await playList(pick(q.at, q.params).filter(g => !q.except.includes(g.id)), q.at); }
}
export const clearEvents = () => { QUEUE.length = 0; };

// ---------- 剧情杀：夜间.js 每次弹转盘前来取（第 day 天第 slot 位来客的第 round 轮；first = 这一轮第一次转） ----------
// 出厂测试、编辑器试玩里没有剧情杀
export const fateFor = (round, first) => G.tutorial || G.noSave ? null : takeFate(G.day, G.cur + 1, round, first);
function takeFate(day, slot, round, first) {
  const rs = G.story.rigs, i = rs.findIndex(r => r.slot == null || (first && r.day === day && r.slot === slot && (r.round == null || r.round === round)));
  if (i < 0) return null; const r = rs.splice(i, 1)[0]; return { attr: r.attr, mode: r.mode || 'hit' };
}

// ---------- 一段 ----------
async function play(g) {
  const my = ++S.gen, alive = () => my === S.gen, busy = G.busy;
  if (!G.story.played.includes(g.id)) G.story.played.push(g.id);
  S.on = true; S.seg = g; S.skip = false; S.log = []; G.busy = true;
  do { await wait(30); if (!alive()) return; } while (wiping());   // 等过场擦屏擦完（擦屏常常紧跟在挂点后面才开始，所以先让一拍）
  if (!curConv()) { const c = newConv(); writeTo(c); showConv(c, false); }   // 窗口里的积木要有个会话可写
  let id = g.start || g.nodes?.[0]?.id, guard = 0;
  while (id && alive() && guard++ < 500) {
    const n = (g.nodes || []).find(x => x.id === id); if (!n) { console.warn('剧情段', g.id, '没有节点', id); break; }
    const r = await runNode(g, n, alive); if (!alive()) return;
    id = r?.end ? null : r?.to !== undefined ? r.to : n.next;
  }
  if (!alive()) return;
  await close();
  S.on = false; S.seg = null; G.busy = busy;
}
// 编辑器的剧情预览（?剧情预览=1）：不看挂点和条件，直接把这一段从 from 节点（不写就是开始节点）播下去；
// 进结局只记下来、不收尾整局。返回进了哪个结局（没进就是 null）
export async function playPreview(g, from) {
  storyAbort(); await play(from ? { ...g, start: from } : g);
  const end = S.endReq; S.endReq = null; return end;
}
// 回标题 / 读档时：停下正在播的剧情
export function storyAbort() {
  S.gen++; S.on = false; S.seg = null; S.adv?.(); S.pick?.(null);
  vn.className = ''; $('vlog').classList.remove('on'); clearCast(); $('vfade').style.opacity = 0; $('vpic').className = ''; S.endReq = null; clearEvents();
}

async function runNode(g, n, alive) {
  const steps = n.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const b = steps[i], key = `${g.id}/${n.id}/${i}`;
    if (S.skip && !readSeen(key) && b.do !== 'choice') { S.skip = false; bar(); toast('没读过的地方，停下来了'); }
    const r = await step(b, key, alive); if (!alive()) return null;
    readMark(key);
    if (r) return r;
  }
  return null;
}
// 一块积木。返回 {to} / {end} 就改道，否则接着下一块
async function step(b, key, alive) {
  b = lineOf(b);   // 写了几个说法就随机挑一句
  switch (b.do) {
    case 'say': await say(b); return;
    case 'caption': await caption(b); return;
    case 'picture': await picture(b); return;
    case 'fade': await fade(b); return;
    case 'choice': return await choice(b, alive);
    case 'if': return RULES.storyCond(b.when, storyState()) ? { to: b.to } : b.else ? { to: b.else } : null;
    case 'goto': return { to: b.to };
    case 'end': return { end: true };
    case 'set': setVar(b.name, b.value, b.add); return;
    case 'stat': stat(b); return;
    case 'corpus': corpus(b); return;
    case 'activity': G.story.acts[b.act] = !(b.on === false || b.on === 'false'); toast(`${({ pretrain: '预训练', posttrain: '后训练', eat: '吃白饭' })[b.act] || b.act}：${G.story.acts[b.act] ? '开放了' : '关掉了'}`); return;
    case 'visitor': setSlot(b); return;
    case 'rig': G.story.rigs.push({ day: b.slot ? dayOf(b) : null, slot: b.slot ? +b.slot : null, round: b.round ? +b.round : null, attr: b.attr, mode: b.mode || 'hit' }); return;
    case 'ach': giveAch(b.id); return;
    case 'ending': S.endReq = b.id || 'hearts'; return { end: true };
    case 'phone': hide(); phonePost({ ...b, avatar: b.avatar ? asset(b.avatar) : null }); await until(() => !$('phone').classList.contains('show') || !alive()); return;
    case 'youSay': hide(); await harness(() => youSay(b.text || '')); return;
    case 'aiSay': if (G.mode === 'day') { hide(); await harness(() => fishSay(b.text || '')); return; } break;   // 白天她用 LINE 气泡说
  }
  // 只动整个画面的（故障、震屏、压暗、音效、等待）：对话框留着，特效直接叠在对话画面上
  if (overVN(b)) { $('dim').classList.add('overvn'); try { await harness(() => runFx([b])); } finally { $('dim').classList.remove('overvn'); } return; }
  hide(); await harness(() => runFx([b]));   // 其余（往对话栏里加东西、换表情、换显示器）交给夜间的积木播放器，演在窗口里面
}
// 不往对话栏、工位里加东西的积木；「同时进行」和共享演出要里面每一块都是这种才算
const OVER = new Set(['glitch', 'shake', 'dim', 'sound', 'wait']);
function overVN(b, d = 0) {
  if (OVER.has(b.do)) return true;
  const kids = b.do === 'together' ? b.steps : b.do === 'show' && d < 5 ? showById(b.id)?.steps : null;
  return !!kids?.length && kids.every(x => overVN(x, d + 1));
}
// 窗口里的积木：快进 / 跳过时按最快的倍速演
async function harness(fn) { const s = G.spd; if (quick()) G.spd = SPEEDS.length - 1; try { await fn(); } finally { G.spd = s; } }
const until = fn => new Promise(ok => { const t = setInterval(() => { if (fn()) { clearInterval(t); ok(); } }, 60); });
// 剧情里的图片：写相对路径就从 剧本/_剧情/ 找，写 / 开头就是站内绝对路径
const asset = p => !p ? '' : p.startsWith('/') || /^[a-z]+:/.test(p) ? p : '/剧本/_剧情/' + p;
// ---------- 改状态（只改这一局） ----------
const dayOf = b => b.day ? +b.day : G.day + (+b.in || 0);   // day 写第几天；不写就看 in（0 今天、1 明天……）
const STAT = { hearts: ['心', P.rose], quota: ['额度', P.sky], ap: ['行动点', P.lgold], rollbacks: ['回档次数', P.mint] };
function stat(b) {
  const k = b.k; if (!STAT[k]) return; const was = G[k] ?? 0;
  let v = b.set != null && b.set !== '' ? +b.set : was + (+b.add || 0);
  const max = { hearts: G.heartMax, quota: G.quotaMax }[k]; v = Math.max(0, max != null ? Math.min(max, v) : v);
  G[k] = v; if (k === 'ap' && v > G.apMax) G.apMax = v;
  renderHUD(); renderAP(); const d = v - was; if (!d) return;
  toast(`${STAT[k][0]} ${d > 0 ? '+' : ''}${d}（现在 ${v}）`); if (d > 0) { SFX.heartIn(); vignette(k === 'hearts' ? 'pink' : 'gold'); } else { SFX.damage(); vignette('red'); glitch(1); }
  if (k === 'hearts' && v <= 0 && DATA.sched.start.heartsOutEnds) S.endReq = 'hearts';
}
// 解锁语料：学到 level（1 浅层 / 2 深层，不写 = 再学一层）
function corpus(b) {
  const a = b.attr; if (!AT[a]) return; const to = Math.min(2, b.level ? +b.level : (G.stage[a] || 0) + 1);
  if ((G.stage[a] || 0) >= to) return; while ((G.stage[a] || 0) < to) learn(a);
  drawRoomItems(); flash(); SFX.unlock(); vignette('gold'); toast(`解锁 · ${AT[a].n}${to === 2 ? '深层' : '浅层'}「${AT[a].lv[to - 1]}」`);
}
// 改来客位：第 day 天第 slot 位改成某用户（的某个场景）；user 不写 = 改回随机
function setSlot(b) {
  const d = dayOf(b), k = +b.slot || 1; (G.story.slots[d] ||= {})[k] = b.user ? { user: b.user, scene: b.scene || null } : 'random';
  if (d === G.day && G.mode === 'day') HANDLERS.slot?.(k);   // 今晚的预告已经排好了：换掉那一位
}
function giveAch(id) {
  if (!id) return; (G.achievements ||= new Set()).add(id); toast('🏆 成就解锁：' + regName('achievements', id)); SFX.unlock(); vignette('gold');
}
// 剧情变量：value 写的是字符串时，true / false / 数字转成对应的值
function setVar(name, value, add) {
  if (!name) return; const v = G.story.vars;
  if (add != null && add !== '') { v[name] = (Number(v[name]) || 0) + Number(add); return; }
  v[name] = value === undefined || value === '' ? true : value === 'true' ? true : value === 'false' ? false : typeof value === 'string' && value.trim() !== '' && !isNaN(value) ? Number(value) : value;
}

// ---------- #vn 这一层 ----------
function show(mode) { vn.classList.add('on'); vn.classList.toggle('cap', mode === 'cap'); bar(); }
function hide() { vn.classList.remove('on', 'cap'); }
async function close() {
  if (vn.classList.contains('on')) { vn.classList.add('out'); await wait(260); }
  vn.className = ''; clearCast(); $('vpic').className = ''; $('vfade').style.opacity = 0; $('vtext').textContent = ''; $('vchoice').innerHTML = '';
}
function bar() { document.querySelectorAll('#vbar [data-k]').forEach(e => e.classList.toggle('on', { auto: S.auto, fast: S.fast || S.ctrl, skip: S.skip, log: logOn() }[e.dataset.k])); }

// 角色：角色表里找；立绘没有就用大肥鱼的占位精灵（tint 换个色，好分清是谁）
const charOf = id => id ? (DATA.story.chars || []).find(c => c.id === id) || { id, name: id } : null;
const FACE = { 开心: ['hop', '♪'], 生气: ['shk', '💢'], 慌: ['shk', '💦'], 震惊: ['shock', '❗'], 难过: ['sad', '💧'], 疑惑: ['', '？'], 得意: ['hop', '✨'] };
const POS = { left: 190, center: 480, right: 770 };
function enter(c, pos = 'center', face) {
  let el = S.cast.get(c.id);
  if (!el) {
    el = document.createElement('div'); el.className = 'vch'; el.innerHTML = '<img alt=""><span class="emo"></span><span class="ph r2">立绘占位</span>';
    $('vchars').appendChild(el); S.cast.set(c.id, el); restart(el, 'in'); SFX.pop(1);
  }
  // 同一个位置只站一个人：别人挪开
  for (const [k, o] of S.cast) if (k !== c.id && o.dataset.pos === pos) { o.remove(); S.cast.delete(k); }
  el.dataset.pos = pos; el.style.left = POS[pos] + 'px'; el.classList.toggle('flip', pos === 'right');
  const src = c.portraits?.[face] || c.portraits?.['默认'], img = el.querySelector('img');
  img.src = src ? asset(src) : FISH.day; el.classList.toggle('placeholder', !src);
  img.style.filter = !src && c.tint ? `hue-rotate(${c.tint}deg)` : '';
  const f = FACE[face], emo = el.querySelector('.emo');
  if (face && f) { if (f[0]) restart(img, f[0]); emo.textContent = f[1]; restart(emo, 'on'); ({ 生气: SFX.thud, 慌: SFX.zap, 震惊: SFX.zap, 开心: () => SFX.pop(3), 得意: () => SFX.pop(4) }[face] || (() => { }))(); }
  else emo.classList.remove('on');
}
function focus(id) { for (const [k, o] of S.cast) o.classList.toggle('dim', k !== id); }
function clearCast() { $('vchars').innerHTML = ''; S.cast.clear(); }
// 说话声：大肥鱼用她白天那种「哔」，别的角色按 voice（音高倍数）变调
const voiceOf = c => c?.id === 'fish' ? () => SFX.voice() : () => SFX.type();

// 一个字一个字打出来；点一下（或快进）直接出完
async function type(el, text, voice) {
  S.typing = true; S.full = false; el.textContent = '';
  for (const ch of text) {
    if (S.full || quick()) break;
    el.textContent += ch;
    if (!/[\s，。！？、…—～「」!?,.]/.test(ch)) voice(); else await wait(90 / spd());
    await wait(34 / spd());
  }
  el.textContent = text; S.typing = false;
}
// 等玩家点下一句：自动模式按字数等，快进一闪而过，跳过不等
function next(text) {
  $('vnext').classList.add('on');
  if (S.skip) return wait(16);
  if (S.fast || S.ctrl) return wait(70);
  return new Promise(ok => {
    let t = 0; S.adv = () => { S.adv = null; clearTimeout(t); $('vnext').classList.remove('on'); ok(); };
    if (S.auto) t = setTimeout(() => S.adv?.(), 900 + text.length * 60 / spd());
  });
}
function logPush(name, text, color) { S.log.push({ name, text, color }); if (S.log.length > 300) S.log.shift(); }

async function say(b) {
  const c = charOf(b.who); show();
  if (c) enter(c, b.pos || (S.cast.get(c.id)?.dataset.pos) || 'center', b.face); focus(c?.id);
  const nm = $('vname'); nm.style.display = c ? '' : 'none'; if (c) { nm.textContent = c.name; nm.style.background = c.color || P.cobalt; restart(nm, 'in'); }
  $('vbox').classList.toggle('narr', !c); $('vnext').classList.remove('on');
  await type($('vtext'), b.text || '', voiceOf(c));
  logPush(c?.name || '', b.text || '', c?.color); await next(b.text || '');
}
async function caption(b) {
  show('cap'); const el = $('vcap'); $('vnext').classList.remove('on'); restart(el, 'in');
  await type(el, b.text || '', () => SFX.type()); logPush('', b.text || ''); await next(b.text || '');
}
async function picture(b) {
  show(); const p = $('vpic'); vn.classList.add('pic'); clearCast();
  // 图还没交（文件不存在）就画占位，写上文件名：美术把图放到那个路径就自动换上
  const ok = b.src && await new Promise(r => { const im = new Image(); im.onload = () => r(true); im.onerror = () => r(false); im.src = asset(b.src); });
  p.className = ok ? 'on' : 'on ph'; p.style.backgroundImage = ok ? `url("${asset(b.src)}")` : ''; p.dataset.name = '插画占位' + (b.src ? ' · ' + b.src : '');
  restart(p, 'in'); SFX.page();
  if (b.text) await say({ text: b.text }); else { $('vbox').classList.add('hidden'); await next(''); $('vbox').classList.remove('hidden'); }
}
async function fade(b) {
  show(); const f = $('vfade'), sec = quick() ? .05 : (b.seconds ?? .8);
  f.style.transition = `opacity ${sec}s steps(8)`; f.style.opacity = b.to === 'in' ? 0 : 1;
  if (b.to === 'in') { vn.classList.remove('pic'); $('vpic').className = ''; }
  else { clearCast(); $('vtext').textContent = ''; $('vname').style.display = 'none'; }
  await wait(sec * 1000 + 40);
}
// 选项：跳过停在这里；1–4 / ↑↓ + Enter / 鼠标都能选
function choice(b, alive) {
  S.skip = false; S.fast = false; bar(); show();
  const opts = (b.options || []).filter(o => o && o.text);
  if (b.prompt) { $('vname').style.display = 'none'; $('vbox').classList.add('narr'); $('vtext').textContent = b.prompt; } else $('vbox').classList.add('hidden');
  focus(null);
  const box = $('vchoice'); box.innerHTML = ''; let sel = -1;
  return new Promise(ok => {
    const pick = i => {
      if (i == null) { S.pick = null; ok(null); return; }   // 被打断
      const o = opts[i]; if (!o) return; S.pick = null;
      const el = box.children[i]; el.classList.add('picked'); [...box.children].forEach((x, k) => k !== i && x.classList.add('gone'));
      SFX.confirm(); flash(); shake();
      if (o.set) for (const [k, v] of Object.entries(o.set)) setVar(k, v);
      logPush('▸', o.text, P.lgold);
      setTimeout(() => { box.innerHTML = ''; $('vbox').classList.remove('hidden'); if (alive()) ok(o.to ? { to: o.to } : null); }, 520);
    };
    const hl = i => { sel = i; [...box.children].forEach((x, k) => x.classList.toggle('sel', k === i)); };
    opts.forEach((o, i) => {
      const d = document.createElement('div'); d.className = 'vopt r2'; d.style.animationDelay = (i * 70) + 'ms';
      d.innerHTML = `<span class="k">${i + 1}</span><span class="tx"></span>`; d.querySelector('.tx').textContent = o.text;
      d.onmouseenter = () => { hl(i); SFX.hover(); }; d.onclick = e => { e.stopPropagation(); if (S.pick) pick(i); };
      box.appendChild(d); setTimeout(() => SFX.step(i), i * 70);
    });
    S.pick = pick; S.hl = d => hl(sel < 0 ? (d > 0 ? 0 : opts.length - 1) : (sel + d + opts.length) % opts.length); S.sel = () => sel;
  });
}

// ---------- 回看 ----------
function openLog() {
  const L = $('vlog'), body = L.querySelector('.lbody'); body.innerHTML = '';
  for (const e of S.log) {
    const d = document.createElement('div'); d.className = 'le';
    if (e.name) { const n = document.createElement('b'); n.textContent = e.name; n.style.color = e.color || P.sky; d.appendChild(n); }
    const t = document.createElement('div'); t.textContent = e.text; d.appendChild(t); body.appendChild(d);
  }
  if (!S.log.length) body.textContent = '（还没有对白）';
  L.classList.add('on'); body.scrollTop = body.scrollHeight; SFX.page();
}
const closeLog = () => { $('vlog').classList.remove('on'); SFX.click(); };
const logOn = () => $('vlog').classList.contains('on');

// ---------- 操作 ----------
function advance() {
  if (logOn()) return closeLog();
  if (S.pick) return;
  if (S.typing) { S.full = true; return; }
  if (S.adv) { SFX.blip(); S.adv(); }
}
function toggle(k) {
  if (k === 'log') return logOn() ? closeLog() : openLog();
  S[k] = !S[k]; if (k === 'skip' && S.skip) { S.auto = false; S.full = true; S.adv?.(); }
  if (k === 'auto' && S.auto && S.adv && !S.typing) setTimeout(() => S.auto && S.adv?.(), 500);
  if (k === 'fast' && S.fast) { S.full = true; S.adv?.(); }
  SFX.click(); bar();
}
vn.addEventListener('click', e => { if (e.target.closest('#vbar,#vchoice,#vlog')) return; advance(); });
vn.addEventListener('wheel', e => { if (e.deltaY < 0 && !logOn()) openLog(); else if (e.deltaY > 0 && logOn()) { const b = $('vlog').querySelector('.lbody'); if (b.scrollTop + b.clientHeight >= b.scrollHeight - 2) closeLog(); } }, { passive: true });
vn.addEventListener('contextmenu', e => { e.preventDefault(); if (logOn()) closeLog(); });
document.querySelectorAll('#vbar [data-k]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggle(b.dataset.k); }));
$('vlog').querySelector('.x').addEventListener('click', e => { e.stopPropagation(); closeLog(); });

// 剧情播放时的按键（主程序.js 转过来）。返回 true 表示吃掉了
export function storyKeyDown(e) {
  if (!S.on) return false;
  if (e.key === 'Control') { if (!S.ctrl) { S.ctrl = true; S.full = true; S.adv?.(); bar(); } return true; }
  if ($('phone').classList.contains('show')) { if (['Escape', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); $('phone-x').click(); } return true; }
  if (logOn()) { if (['Escape', 'KeyL', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); closeLog(); } return true; }
  if (S.pick) {
    if (/^Digit[1-4]$/.test(e.code)) S.pick(+e.code.slice(5) - 1);
    else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); S.hl(e.code === 'ArrowDown' ? 1 : -1); SFX.hover(); }
    else if ((e.code === 'Enter' || e.code === 'Space') && S.sel() >= 0) { e.preventDefault(); S.pick(S.sel()); }
    else if (e.code === 'KeyL') openLog();
    return true;
  }
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); advance(); }
  else if (e.code === 'KeyA') toggle('auto');
  else if (e.code === 'KeyS') toggle('skip');
  else if (e.code === 'KeyL' || e.code === 'ArrowUp') openLog();
  return true;
}
export function storyKeyUp(e) { if (e.key === 'Control' && S.ctrl) { S.ctrl = false; bar(); } }
addEventListener('blur', () => { S.ctrl = false; bar(); });
