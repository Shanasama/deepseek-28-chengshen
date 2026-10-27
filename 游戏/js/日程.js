// 日程：一天一天往下走。白天 → 开始营业 → 一晚几位用户接连上线（一位一个会话）→ 每晚结算 → 下一天。
// 每天的安排全在 剧本/_日程表.json；3 天 Demo 和 28 天本体是同一套代码，只是表的行数不同。
// 存档（v3 §7.3）：每天早上开工前自动存；手动存读档只在白天；心归零时回档到今晚开始前（次数看日程表）。
import { G, QT, freshStats, spd } from './状态.js';
import { $, wait, shuffle, restart, toast, fmt, stage } from './基础.js';
import { SFX } from './音频.js';
import { glitch } from './特效.js';
import { setFish, drawRoomItems } from './工位.js';
import { newConv, showConv, writeTo, clearConvs, addNote, addLog, fishSay, clearFlights } from './对话栏.js';
import { setMode, renderHUD, renderAP, renderClock, renderDrawer, setUrl, HOME, wipe, clearWipe, drawer, setSessionPicker, renderQueue } from './界面.js';
import { closeNode, NODE } from './转盘.js';
import { snapPrev } from './训练.js';
import { DATA, loadScene } from './数据.js';
import { runSession, abortRun, previewShow, DETECT_OF } from './夜间.js';
import { view, bubble, dayToday } from './白天.js';
import { showReport, showEnd, showFinal, renderSelf } from './报告.js';
import { autoSave, applyState, snapNight, restoreNight, nightSnap } from './存档.js';
import { showTitle, leaveTitle } from './标题.js';

const days = () => DATA.sched.days.filter(d => !d.skip);
const lastDay = () => Math.max(...days().map(d => d.day));
const nextDayOf = n => days().map(d => d.day).filter(d => d > n).sort((a, b) => a - b)[0];

// ---------- 开新一局 / 读档 ----------
export function newGame() {
  leaveTitle(); TRIAL = null; G.noSave = false; resetGame(); G.started = true; G.startT = performance.now();
  setSessionPicker(pickSession); clearConvs(); startDay(days()[0].day); SFX.morning();
}
// 读一份存档（存档只在白天存，所以读回来一定是白天）：回到存档那一刻，聊天记录不恢复
export async function loadSave(s) {
  await quitRun(); leaveTitle(); TRIAL = null; G.noSave = false; resetGame(); applyState(s.state);
  G.started = true; G.startT = performance.now(); setSessionPicker(pickSession); clearConvs();
  QT.forEach(t => { G.adj[t] = G.adj[t] || {}; });
  setMode('day'); drawRoomItems(); $('calday').textContent = G.day; restart($('cal'), 'flip'); renderClock(); setUrl(HOME(), true);
  const conv = newConv(); writeTo(conv); showConv(conv, true);
  addNote(`读档 · 第 ${G.day} 天 · ${fmt(G.clock)}`, 'day');
  fishSay(G.ap > 0 ? `……刚才说到哪了？还剩 ${G.ap} 个行动点，接着来！` : '……行动点用完了，可以开始营业啦。');
  bubble(true); view('menu'); renderSelf(); renderHUD(); renderAP(); renderDrawer(); SFX.morning();
}
// 整局状态回到日程表的开局
function resetGame() {
  const s = DATA.sched.start;
  Object.assign(G, {
    hearts: s.hearts, heartMax: s.heartMax, quota: s.quota, quotaMax: s.quotaMax, rollbacks: s.rollbacks, tiboUsed: false, over: false,
    stage: { ...s.stage }, adj: JSON.parse(JSON.stringify(s.adj || {})), done: {}, qSeen: {}, qSeq: 0, used: {}, eggSeen: new Set(), achievements: new Set(),
    total: freshStats(), stats: freshStats(), history: [], sessions: [], cur: -1, busy: false,
  });
  QT.forEach(t => { G.adj[t] = G.adj[t] || {}; });
}
// 停下正在进行的一切（回到标题、读档之前）
export async function quitRun() {
  NIGHT++; TRIAL = null; abortRun(); if (NODE.state !== 'hidden') closeNode(); clearFlights();
  ['report', 'endcard', 'final', 'restore', 'modal'].forEach(id => $(id).classList.remove('on')); $('phone').classList.remove('show');
  $('cursor').style.display = 'none'; stage.classList.remove('rewind'); clearWipe(); drawer(false); bubble(false);
  Object.assign(G, { over: false, busy: false, started: false, cur: -1, sessions: [], skipping: false });
}

// ---------- 单场试玩（剧情编辑器「在游戏里玩」：?play=用户/场景.json&st=…&adj=…） ----------
// 跳过白天，带着编辑器的训练状态直接演这一个场景；演完弹每晚结算，点一下再玩一次。心扣光也不结束，不读写存档
let TRIAL = null;
export function startTrial(t) {
  TRIAL = t; G.noSave = true; resetGame(); clearConvs(); setSessionPicker(pickSession);
  const e = DATA.list.find(x => x.dir === t.dir);
  if (!e) return toast('剧本库里没有这个用户：' + t.dir);
  if (t.stages) Object.assign(G.stage, t.stages);
  if (t.adj) G.adj = JSON.parse(JSON.stringify(t.adj));
  QT.forEach(q => { G.adj[q] = G.adj[q] || {}; });
  Object.assign(G, { day: 1, busy: false, tok: 0, cur: -1, sessions: [], stats: freshStats(), started: true });
  snapPrev(); drawRoomItems();
  G.tonight = [{ name: e.user.name, bio: e.user.bio, dir: e.dir, avatar: e.user.avatar, boss: !!e.user.boss, repeat: false, file: t.file, entry: e }];
  startNight();
}
// 只播一段共享演出（编辑器「在游戏里预览」）：夜间工位上播，Enter 再播一遍
export async function startShowPreview(id) {
  G.noSave = true; G.started = true; G.showPreview = id; await wipe(true); setMode('night'); clearConvs(); const conv = newConv(); writeTo(conv); showConv(conv, true);
  G.clock = 21 * 60; renderClock(); setUrl(HOME(), true); await wipe(false); previewShow(id);
}
export const replayShow = () => { if (G.showPreview) previewShow(G.showPreview); };

// ---------- 白天 ----------
export function startDay(n) {
  const cfg = DATA.sched.days.find(d => d.day === n) || {};
  Object.assign(G, { day: n, apMax: cfg.ap ?? 4, ap: cfg.ap ?? 4, post: 0, postMax: cfg.postPerDay ?? 2, clock: 9 * 60, busy: false, tok: 0, cur: -1, sessions: [], stats: freshStats() });
  if (cfg.resetQuota) G.quota = G.quotaMax;
  snapPrev(); rollTonight();
  setMode('day'); $('calday').textContent = n; restart($('cal'), 'flip'); renderClock(); setUrl(HOME(), true);
  const conv = newConv(); writeTo(conv); showConv(conv, true);
  addNote(`第 ${n} 天 · 09:00`, 'day');
  fishSay(`早上好！今天有 ${G.ap} 个行动点，干点啥？` + (G.tonight.some(v => v.boss) ? '（听说今晚有个不好惹的家伙要来……）' : ''));
  bubble(true); view('menu'); renderSelf(); restart($('vdot'), 'bump');
  // 每天早上开工前自动存一次（存读档界面第 1 格）
  if (!TRIAL) { autoSave(); addLog('已自动存档（存读档界面第 1 格）', 'sys'); }
}
// 今晚来访：日程表指定的人（Boss）先定下来，其余从「还有没用过的场景」的用户里随机抽；
// 剧本不够时让已有用户再来一次（占位 · 重复来访），等剧本库补上新人就自动换掉
export function rollTonight() {
  const cfg = dayToday(), want = cfg.visitors ?? 4, list = DATA.list.filter(e => !e.user.tutorial);
  const fixed = (cfg.fixed || []).map(dir => list.find(e => e.dir === dir)).filter(Boolean);
  const normal = list.filter(e => !e.user.boss && !fixed.includes(e));
  const out = [], visitor = (e, i, repeat) => ({ name: e.user.name, bio: e.user.bio, dir: e.dir, avatar: e.user.avatar, boss: !!e.user.boss, repeat, file: e.scenes[i]?.file, entry: e });
  for (const e of shuffle(normal.filter(e => (G.used[e.dir] || 0) < e.scenes.length))) { if (out.length >= want - fixed.length) break; out.push(visitor(e, G.used[e.dir] || 0, false)); G.used[e.dir] = (G.used[e.dir] || 0) + 1; }
  shuffle(out);
  // 占位排在后面，并且不紧挨着同一个人
  const pool = shuffle(normal.filter(e => e.scenes.length));
  for (let k = 0; out.length < want - fixed.length && pool.length; k++) {
    const prev = out[out.length - 1]?.dir, e = pool.find(x => x.dir !== prev && !out.some(o => o.repeat && o.dir === x.dir)) || pool[k % pool.length];
    out.push(visitor(e, Math.random() * e.scenes.length | 0, true));
  }
  fixed.forEach(e => { const i = Math.min(G.used[e.dir] || 0, e.scenes.length - 1); out.push(visitor(e, i, (G.used[e.dir] || 0) >= e.scenes.length)); G.used[e.dir] = (G.used[e.dir] || 0) + 1; });
  G.tonight = out;
}

// ---------- 夜里 ----------
let NIGHT = 0;
export async function startNight() {
  const my = ++NIGHT; G.busy = true; drawer(false);
  if (!TRIAL) snapNight();   // 回档点：开始营业这一刻
  await wipe(true); if (my !== NIGHT) return;
  setMode('night'); G.stats = freshStats();
  // 一位用户一个会话
  G.sessions = await Promise.all(G.tonight.map(async v => {
    const u = v.entry.user, scene = await loadScene(v.dir, v.file);
    return { visitor: v, dir: v.dir, file: v.file, scene, user: u, status: 'queue', result: null, conv: newConv(),
      U: { name: u.name, bio: u.bio || '', avatar: u.avatar, temper: u.temper || 1, detect: DETECT_OF(u.detect), farewell: u.farewell || {}, N: scene.rounds.length } };
  }));
  G.clock = 21 * 60 + 3; renderClock(); setUrl(HOME(), true); renderDrawer();
  await wipe(false); G.busy = false; SFX.slow();
  for (let i = 0; i < G.sessions.length; i++) {
    if (my !== NIGHT) return;
    const s = G.sessions[i]; G.cur = i; s.status = 'live'; renderDrawer();
    writeTo(s.conv); showConv(s.conv, i > 0);
    let r = await runSession(s);
    if (r === 'abort') { if (!G.skipping) return; G.skipping = false; r = 'drop'; addNote('（开发面板：跳过了这位用户）', 'sys'); }
    s.result = r; s.status = 'done'; s.resultLabel = { solved: '解决离开', win: '特殊胜利', offline: '下线', forced: '强制下线', drop: '掉线' }[r]; renderDrawer();
    G.clock += 20; renderClock();
    if (G.hearts <= 0 && DATA.sched.start.heartsOutEnds && !TRIAL) { await wait(900); if (my !== NIGHT) return; return heartsOut(); }
    await wait(1400 / spd());
  }
  if (my !== NIGHT) return;
  G.cur = -1; renderQueue(); setFish('idle');
  await wait(700);
  if (TRIAL) { await showReport(false, true); return startTrial(TRIAL); }
  G.history.push(dayLine());
  const last = G.day >= lastDay();
  await showReport(last);
  if (my !== NIGHT) return;
  if (last) { await showFinal('demo'); await quitRun(); return showTitle(); }
  await wipe(true); startDay(nextDayOf(G.day)); await wipe(false); SFX.morning();
}
const dayLine = (out = false) => ({ day: G.day, solved: G.stats.solved, lost: G.stats.lost, like: G.stats.like, eggs: G.stats.eggs, out });
// 开发面板：跳过当前用户
export function skipCurrent() { if (G.mode !== 'night' || G.cur < 0) return; G.skipping = true; abortRun(); if (NODE.state !== 'hidden') closeNode(); clearFlights(); $('cursor').style.display = 'none'; }
// 回看已经结束的会话（只能看）
function pickSession(i) {
  const s = G.sessions[i]; if (!s) return;
  if (s.status === 'queue') return toast('还没轮到 ta');
  showConv(s.conv); drawer(false);
  if (i !== G.cur) toast('正在回看（只能看）· 点「进行中」的会话回去');
}

// ---------- 心归零：先问回档，不回（或用完了）就整局结算 ----------
async function heartsOut() {
  abortRun(); if (NODE.state !== 'hidden') closeNode(); clearFlights();
  if (G.rollbacks > 0 && nightSnap() && await askRestore()) return rollback();
  gameOver();
}
// Restore checkpoint 对话框（美术规范 §10.6）
function askRestore() {
  const s = nightSnap();
  $('rlist').innerHTML = [
    `<span class="ok">❤ 心 ${G.hearts} → ${s.hearts}</span>`, `<span class="ok">控盘额度 ${G.quota} → ${s.quota}</span>`,
    `<span>今晚的 ${G.tonight.length} 位用户和出场顺序不变，白天的训练保留</span>`, `<span class="bad">回档 剩 ${G.rollbacks} 次 → ${G.rollbacks - 1 ? '剩 ' + (G.rollbacks - 1) + ' 次' : '用完'}</span>`,
  ].join('');
  $('restore').classList.add('on'); SFX.note(); glitch();
  return new Promise(ok => {
    const done = v => { $('restore').classList.remove('on'); SFX.click(); ok(v); };
    $('ryes').onclick = () => done(true); $('rno').onclick = () => done(false);
  });
}
// 倒带：对话栏一个会话一个会话飞快地往回滚，画面故障一下，回到今晚第一位用户上线前
async function rollback() {
  const my = ++NIGHT; SFX.shuffle(); glitch(2); stage.classList.add('rewind');
  const done = G.sessions.slice(0, G.cur + 1).reverse();
  for (const s of done) {
    showConv(s.conv); const m = $('msgs'), from = m.scrollHeight, t0 = performance.now();
    while (true) { const k = Math.min(1, (performance.now() - t0) / 260); m.scrollTop = from * (1 - k); if (k >= 1) break; await wait(16); }
    SFX.tick(.2); if (my !== NIGHT) return;
  }
  stage.classList.remove('rewind'); glitch(2);
  restoreNight(); G.over = false; clearConvs(); drawRoomItems(); renderHUD(); renderAP();
  toast(`已回档到今晚开始前 · 回档${G.rollbacks > 0 ? '还剩 ' + G.rollbacks + ' 次' : '用完了'}`);
  startNight();
}
function gameOver() {
  G.over = true; G.history.push(dayLine(true));
  showEnd('hearts', async () => { await showFinal('hearts'); await quitRun(); showTitle(); });
}
