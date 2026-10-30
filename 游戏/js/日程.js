// 日程：一天一天往下走。白天 → 开始营业 → 一晚几位用户接连上线（一位一个会话）→ 每晚结算 → 下一天。
// 每天的安排全在 剧本/_日程表.json；3 天 Demo 和 28 天本体是同一套代码，只是表的行数不同。
// 存档（v3 §7.3）：每天早上开工前自动存；手动存读档只在白天；心归零时回档到今晚开始前（次数看日程表）。
// 新游戏：开场剧情（没有就放剧情占位页）→ Day 0 出厂测试（日程表 event: tutorial 那一行；做过一次以后可以跳过）→ 第 1 天。
// 游戏剧情挂在这些地方（游戏剧情_设计.md §2）：开场、早上开工前、开始营业前（白天.js）、每位用户上线前 / 离开后、每晚结算前 / 后、结局。
import { G, QT, freshStats, freshStory, spd } from './状态.js';
import { $, wait, shuffle, restart, toast, fmt, stage } from './基础.js';
import { SFX } from './音频.js';
import { glitch } from './特效.js';
import { setFish, drawRoomItems } from './工位.js';
import { newConv, showConv, writeTo, clearConvs, addNote, addLog, fishSay, clearFlights } from './对话栏.js';
import { setMode, renderHUD, renderAP, renderClock, renderDrawer, setUrl, HOME, wipe, clearWipe, drawer, setSessionPicker, renderQueue, confirmBox, loseHeart } from './界面.js';
import { closeNode, NODE } from './转盘.js';
import { snapPrev } from './训练.js';
import { DATA, loadScene } from './数据.js';
import { runSession, abortRun, previewShow, DETECT_OF } from './夜间.js';
import { view, bubble, dayToday, tutorialQuestion } from './白天.js';
import { showReport, showEnd, showFinal, renderSelf } from './报告.js';
import { autoSave, applyState, snapNight, restoreNight, nightSnap, tutDone, markTutDone } from './存档.js';
import { story, tutNight, tutEnd, installCorpus, day1Guide, closeSpot } from './教学.js';
import { showTitle, leaveTitle } from './标题.js';
import { hook, fire, flushEvents, clearEvents, storyAbort, HANDLERS } from './剧情.js';

const days = () => DATA.sched.days.filter(d => !d.skip && d.event !== 'tutorial');
const tutDay = () => DATA.sched.days.find(d => d.event === 'tutorial');
const lastDay = () => Math.max(...days().map(d => d.day));
const nextDayOf = n => days().map(d => d.day).filter(d => d > n).sort((a, b) => a - b)[0];

// ---------- 开新一局 / 读档 ----------
export async function newGame() {
  leaveTitle(); TRIAL = null; G.noSave = false; resetGame(); G.started = true; G.startT = performance.now();
  setSessionPicker(pickSession); clearConvs();
  if (!(await hook('opening'))) await story();
  const d0 = tutDay(); let tut = !!d0;
  // 第一次玩必须做出厂测试；做过一次以后可以跳过（跳过就直接拿到教学的结果）
  if (d0 && tutDone()) tut = await confirmBox('要做出厂测试吗？', '新手教学：教转盘、剔除重转，装上口语模块，再做一道后训练。', '做出厂测试', '跳过');
  if (tut) return startTutorial(d0);
  if (d0) { const r = RULES.afterTutorial({ stage: G.stage, adj: G.adj }, d0, DATA.reg, DATA.bank); G.stage = r.stage; G.adj = r.adj; QT.forEach(t => { G.adj[t] = G.adj[t] || {}; }); drawRoomItems(); }
  await wipe(true); startDay(days()[0].day); await wipe(false); SFX.morning();
}
// ---------- 开发者模式（开发.js）----------
// 跳过新手教程：停下正在进行的一切，重开一局，按做完了出厂测试给结果，直接从第 1 天开始（不播开场剧情和第 1 天的引导）
export async function devSkipTutorial() {
  await quitRun(); leaveTitle(); TRIAL = null; G.noSave = false; resetGame(); G.started = true; G.startT = performance.now();
  setSessionPicker(pickSession); clearConvs(); markTutDone();
  const d0 = tutDay(); if (d0) { const r = RULES.afterTutorial({ stage: G.stage, adj: G.adj }, d0, DATA.reg, DATA.bank); G.stage = r.stage; G.adj = r.adj; QT.forEach(t => { G.adj[t] = G.adj[t] || {}; }); drawRoomItems(); }
  await wipe(true); startDay(days()[0].day); await wipe(false);
}
// 直接去第 n 天的早上：这一局的数值、训练、剧情都留着，只是换一天
export async function devGoDay(n) {
  const t0 = G.startT; await quitRun(); leaveTitle(); TRIAL = null; G.noSave = false; G.started = true; G.startT = t0 || performance.now();
  setSessionPicker(pickSession); clearConvs(); await wipe(true); startDay(n); await wipe(false);
}

// Day 0 出厂测试：夜里，只来测试员一位；教学额度 1 点
async function startTutorial(d0) {
  const e = DATA.list.find(x => x.dir === d0.tutor); if (!e) { toast('剧本库里没有出厂测试员'); return startDay(days()[0].day); }
  Object.assign(G, { day: 0, tutorial: true, quota: d0.quota ?? 1, quotaMax: d0.quota ?? 1, ap: 0, apMax: 0, post: 0, stats: freshStats(), cur: -1, sessions: [] });
  $('calday').textContent = 0; $('qlbl').textContent = '教学额度'; snapPrev(); tutNight();
  const i = Math.max(0, e.scenes.findIndex(s => s.file === d0.scene));
  G.tonight = [{ name: e.user.name, bio: e.user.bio, dir: e.dir, avatar: e.user.avatar, boss: false, repeat: false, file: e.scenes[i].file, entry: e }];
  startNight();
}
// 读一份存档（存档只在白天存，所以读回来一定是白天）：回到存档那一刻，聊天记录不恢复
export async function loadSave(s) {
  await quitRun(); leaveTitle(); TRIAL = null; G.noSave = false; resetGame(); applyState(s.state);
  G.started = true; G.startT = performance.now(); setSessionPicker(pickSession); clearConvs();
  QT.forEach(t => { G.adj[t] = G.adj[t] || {}; });
  setMode('day'); drawRoomItems(); $('calday').textContent = G.day; restart($('cal'), 'flip'); renderClock(); setUrl(HOME(), true);
  const conv = newConv(); writeTo(conv); showConv(conv, true);
  addNote(`读档 · 第 ${G.day} 天 · ${fmt(G.clock)}`, 'day');
  bubble(true); view('menu'); renderSelf(); renderHUD(); renderAP(); renderDrawer(); SFX.morning();
  // 读的是早上的自动存档：穿越回早上，早上的剧情重新播（选项能重选）
  if (G.morning) { const d = G.day; G.busy = true; await hook('morning'); if (G.day !== d || G.mode !== 'day') return; G.busy = false; G.morning = false; }
  fishSay(G.ap > 0 ? `……刚才说到哪了？还剩 ${G.ap} 个行动点，接着来！` : '……行动点用完了，可以开始营业啦。');
}
// 整局状态回到日程表的开局（出厂状态）
function resetGame() {
  const s = DATA.sched.start;
  Object.assign(G, { tutorial: false, morning: false,
    hearts: s.hearts, heartMax: s.heartMax, quota: s.quota, quotaMax: s.quotaMax, rollbacks: s.rollbacks, tiboUsed: false, over: false,
    stage: { ...s.stage }, adj: JSON.parse(JSON.stringify(s.adj || {})), done: {}, qSeen: {}, qSeq: 0, used: {}, eggSeen: new Set(), achievements: new Set(), story: freshStory(),
    total: freshStats(), stats: freshStats(), history: [], sessions: [], cur: -1, busy: false,
  });
  QT.forEach(t => { G.adj[t] = G.adj[t] || {}; });
}
// 停下正在进行的一切（回到标题、读档之前）
export async function quitRun() {
  NIGHT++; TRIAL = null; abortRun(); storyAbort(); closeSpot(); tutEnd(); G.tutorial = false; $('qlbl').textContent = '额度'; $('story').classList.remove('on'); if (NODE.state !== 'hidden') closeNode(); clearFlights();
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
export function startDay(n, { tut = false } = {}) {
  const cfg = DATA.sched.days.find(d => d.day === n) || {};
  $('qlbl').textContent = '额度';
  Object.assign(G, { day: n, apMax: cfg.ap ?? 4, ap: cfg.ap ?? 4, post: 0, postMax: cfg.postPerDay ?? 2, clock: 9 * 60, busy: false, tok: 0, cur: -1, sessions: [], stats: freshStats() });
  if (cfg.resetQuota) G.quota = G.quotaMax;
  snapPrev(); rollTonight();
  setMode('day'); $('calday').textContent = n; restart($('cal'), 'flip'); renderClock(); setUrl(HOME(), true);
  const conv = newConv(); writeTo(conv); showConv(conv, true);
  addNote(`第 ${n} 天 · 09:00`, 'day');
  bubble(true); renderSelf(); restart($('vdot'), 'bump');
  // 每天早上开工前自动存一次（存读档界面第 1 格）；出厂测试后的第 1 天，等教学题和引导都做完再存
  const save = () => { if (!TRIAL) { autoSave(); addLog('已自动存档（存读档界面第 1 格）', 'sys'); } };
  if (tut) {
    const q = (DATA.bank.questions || []).find(x => x.id === tutDay()?.question);
    // 出厂测试后的第 1 天：早上的剧情先播，再做教学题和引导、存档（教学题必须在存档之前做完）
    (async () => { G.busy = true; await hook('morning'); G.busy = false; if (q && q.pair) await tutorialQuestion(q); else view('menu'); await day1Guide(); save(); })();
    return;
  }
  // 先存档、再播早上的剧情：存档是这一刻的切片，读档回到这里会重播剧情（选项能重选）
  G.morning = true; save(); G.busy = true;   // morning：早上的剧情还没播（自动存档就切在这一刻，读档会接着播）
  (async () => {
    const d = G.day; await hook('morning'); if (G.day !== d || G.mode !== 'day') return; G.busy = false; G.morning = false;
    fishSay(`早上好！今天有 ${G.ap} 个行动点，干点啥？` + (G.tonight.some(v => v.boss) ? '（听说今晚有个不好惹的家伙要来……）' : ''));
    view('menu');
  })();
}
// 今晚来访：日程表这一天的来客位（slots），剧情在这一局改过的位以剧情为准（G.story.slots[第几天][第几位]）。
//   写死的位（{user, scene}）先定；随机位从「还有没用过的场景」的用户里抽；
//   剧本不够时让已有用户再来一次（占位 · 重复来访），排在随机位的后面，等剧本库补上新人就自动换掉
// 旧格式（visitors + fixed）照样认：fixed 的人排在最后
const slotsOf = cfg => cfg.slots || [...Array(Math.max(0, (cfg.visitors ?? 4) - (cfg.fixed || []).length)).fill('random'), ...(cfg.fixed || []).map(user => ({ user }))];
function slotsFor(day) {
  const base = slotsOf(DATA.sched.days.find(d => d.day === day) || {}).slice(), ov = G.story.slots[day] || {};
  for (const [k, v] of Object.entries(ov)) base[+k - 1] = v;
  return base.map(v => v || 'random');
}
const visitorOf = (e, i, repeat) => ({ name: e.user.name, bio: e.user.bio, dir: e.dir, avatar: e.user.avatar, boss: !!e.user.boss, repeat, file: e.scenes[i]?.file, entry: e });
// 写死的位：指定了场景就用那个，没指定就是这个用户下一个没用过的场景
function pinned(e, scene) {
  const used = G.used[e.dir] || 0, at = scene ? e.scenes.findIndex(x => x.file === scene) : -1, i = at >= 0 ? at : Math.min(used, e.scenes.length - 1);
  G.used[e.dir] = used + 1; return visitorOf(e, i, at < 0 && used >= e.scenes.length);
}
export function rollTonight() {
  const list = DATA.list.filter(e => !e.user.tutorial), slots = slotsFor(G.day), out = slots.map(() => null);
  slots.forEach((v, i) => { const e = v !== 'random' && list.find(x => x.dir === v.user); if (e) out[i] = pinned(e, v.scene); });
  const taken = new Set(out.filter(Boolean).map(v => v.dir)), normal = list.filter(e => !e.user.boss && !taken.has(e.dir));
  const R = out.map((v, i) => v ? -1 : i).filter(i => i >= 0), got = [];
  for (const e of shuffle(normal.filter(e => (G.used[e.dir] || 0) < e.scenes.length))) { if (got.length >= R.length) break; got.push(visitorOf(e, G.used[e.dir] || 0, false)); G.used[e.dir] = (G.used[e.dir] || 0) + 1; }
  // 占位排在后面，并且不紧挨着同一个人
  const pool = shuffle(normal.filter(e => e.scenes.length));
  for (let k = 0; got.length < R.length && pool.length; k++) {
    const prev = got[got.length - 1]?.dir, e = pool.find(x => x.dir !== prev && !got.some(o => o.repeat && o.dir === x.dir)) || pool[k % pool.length];
    got.push(visitorOf(e, Math.random() * e.scenes.length | 0, true));
  }
  R.forEach((i, k) => { out[i] = got[k]; });
  G.tonight = out.filter(Boolean);
}
// 白天剧情改了今晚第 k 位：只换那一位，别的预告不动
function patchSlot(k) {
  const i = k - 1, old = G.tonight[i], v = slotsFor(G.day)[i]; if (i < 0 || i > G.tonight.length) return;
  if (old && !old.repeat) G.used[old.dir] = Math.max(0, (G.used[old.dir] || 1) - 1);
  const list = DATA.list.filter(e => !e.user.tutorial), others = new Set(G.tonight.filter((_, j) => j !== i).map(x => x.dir));
  let nv = null;
  if (v !== 'random') { const e = list.find(x => x.dir === v.user); if (e) nv = pinned(e, v.scene); }
  if (!nv) { const e = shuffle(list.filter(e => !e.user.boss && !others.has(e.dir) && (G.used[e.dir] || 0) < e.scenes.length))[0]; if (e) { nv = visitorOf(e, G.used[e.dir] || 0, false); G.used[e.dir] = (G.used[e.dir] || 0) + 1; } }
  if (!nv) return; G.tonight[i] = nv; renderDrawer(); restart($('vdot'), 'bump'); toast(`今晚第 ${k} 位来客换成了 ${nv.name}`);
}
HANDLERS.slot = patchSlot;

// ---------- 夜里 ----------
let NIGHT = 0;
export async function startNight() {
  const my = ++NIGHT; G.busy = true; drawer(false);
  if (!TRIAL && !G.tutorial) snapNight();   // 回档点：开始营业这一刻
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
    await hook('beforeVisitor', { slot: i + 1 }); if (my !== NIGHT) return;
    if (G.tutorial) s.onRoundEnd = async ri => { if (ri === 0) for (const a of tutDay().unlock || []) await installCorpus(a); };
    // 这一场可能被打断：提前下班 / 开发面板跳过。不等被打断的那一场自己收尾（它可能卡在一个永远不来的回调上）
    let r = await Promise.race([runSession(s), new Promise(ok => { CUT = ok; })]); CUT = null;
    if (my !== NIGHT) return;
    if (r === 'early') return finishEarly(i);
    if (r === 'skip') { r = 'drop'; addNote('（开发面板：跳过了这位用户）', 'sys'); }
    if (r === 'abort') return;
    s.result = r; s.status = 'done'; s.resultLabel = { solved: '解决离开', win: '特殊胜利', offline: '下线', forced: '强制下线', drop: '掉线' }[r]; renderDrawer();
    G.clock += 20; renderClock();
    await flushEvents(); if (my !== NIGHT) return;   // 对话中间发生的事件（心变少、额度见底……），排到这时候播
    if (G.hearts <= 0 && DATA.sched.start.heartsOutEnds && !TRIAL) { await wait(900); if (my !== NIGHT) return; return heartsOut(); }
    await hook('afterVisitor', { slot: i + 1 }); if (my !== NIGHT) return;
    await wait(1400 / spd());
  }
  if (my !== NIGHT) return;
  G.cur = -1; renderQueue(); setFish('idle');
  await wait(700);
  if (G.tutorial) return finishTutorial();
  if (TRIAL) { await showReport(false, true); return startTrial(TRIAL); }
  return nightOver(my);
}
// 每晚结算 → 下一天（打满全部天数就进最终评测）
async function nightOver(my) {
  G.history.push(dayLine());
  await flushEvents(); if (my !== NIGHT) return;
  const last = G.day >= lastDay();
  await hook('beforeReport'); if (my !== NIGHT) return;
  await showReport(last);
  if (my !== NIGHT) return;
  await hook('afterReport'); if (my !== NIGHT) return;
  if (last) { endingAch('full'); await hook('ending', { end: 'full' }); if (my !== NIGHT) return; await showFinal('demo'); await quitRun(); return showTitle(); }
  await wipe(true); startDay(nextDayOf(G.day)); await wipe(false); SFX.morning();
}
const dayLine = (out = false) => ({ day: G.day, solved: G.stats.solved, lost: G.stats.lost, like: G.stats.like, eggs: G.stats.eggs, out });
let CUT = null;   // 打断当前这一场：CUT('early') / CUT('skip')
const stopSession = () => { abortRun(); closeSpot(); if (NODE.state !== 'hidden') closeNode(); clearFlights(); $('cursor').style.display = 'none'; };
// 开发面板：跳过当前用户
export function skipCurrent() { if (G.mode !== 'night' || G.cur < 0 || !CUT) return; const c = CUT; stopSession(); c('skip'); }
// 出厂测试结束：不出每晚报告，直接进第 1 天（额度换成正式的 10/10）
async function finishTutorial() {
  const s = DATA.sched.start; tutEnd(); G.tutorial = false; markTutDone();
  addNote('出厂测试通过', 'on'); toast('出厂测试通过！明天正式营业'); SFX.levelup(); await wait(1200);
  G.quota = s.quota; G.quotaMax = s.quotaMax;
  await wipe(true); startDay(days()[0].day, { tut: true }); await wipe(false); SFX.morning();
}
// ---------- 提前下班：还没服务完的每位（含正在服务的）扣 1 颗心、算用户流失，然后照常结算 ----------
export async function endEarly() {
  if (G.mode !== 'night' || G.tutorial || G.noSave || G.cur < 0 || !CUT) return;
  const n = G.sessions.filter(s => s.status !== 'done').length; if (!n) return;
  const left = G.hearts - n;
  const ok = await confirmBox('提前下班？', `还有 ${n} 位用户没服务。提前下班会扣 ${n} 颗心（剩 ${Math.max(0, left)} 颗）。` + (left <= 0 ? '心会扣光，整局结束！' : ''), '提前下班');
  if (!ok || !CUT) return;
  const c = CUT; stopSession(); c('early');
}
async function finishEarly(i) {
  const my = NIGHT, cur = G.sessions[i], rest = G.sessions.slice(i);
  addNote(cur.U.name + ' 已强制下线', 'off'); if (rest.length > 1) addNote('提前下班：' + rest.slice(1).map(s => s.U.name).join('、') + ' 没来得及服务', 'off');
  addLog(`提前下班 · ${rest.length} 位用户没服务完，心 −${rest.length}`, 'bad');
  rest.forEach(s => { s.status = 'done'; s.result = 'early'; s.resultLabel = '提前下班'; }); renderDrawer(); setFish('panic');
  for (const _ of rest) { G.stats.lost++; G.total.lost++; loseHeart(); await wait(320); }
  await wait(900); if (my !== NIGHT) return;
  await fire('heartLost'); if (my !== NIGHT) return;
  if (G.hearts <= 0 && DATA.sched.start.heartsOutEnds) return heartsOut();
  G.cur = -1; renderQueue(); setFish('idle'); nightOver(my);
}
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
  restoreNight(); G.over = false; clearConvs(); clearEvents(); drawRoomItems(); renderHUD(); renderAP();
  toast(`已回档到今晚开始前 · 回档${G.rollbacks > 0 ? '还剩 ' + G.rollbacks + ' 次' : '用完了'}`);
  await fire('rollback'); if (my !== NIGHT) return;
  startNight();
}
function gameOver() {
  G.over = true; G.history.push(dayLine(true)); endingAch('hearts');
  showEnd('hearts', async () => { await hook('ending', { end: 'hearts' }); await showFinal('hearts'); await quitRun(); showTitle(); });
}

// ---------- 结局（游戏剧情_设计.md §7）：每个结局一个成就；剧情的「进结局」积木走 storyEnding ----------
const ENDING_ACH = { full: 'end-full', hearts: 'end-hearts' };
function endingAch(kind) { const id = ENDING_ACH[kind] || kind; if (!(DATA.reg.achievements || []).some(a => a.id === id)) return; (G.achievements ||= new Set()).add(id); }
// 剧情要结束这一局：心被扣光就走心尽的流程（夜里还有回档会先问），否则直接进那个结局
async function storyEnding(id) {
  if (id === 'hearts') { if (G.mode === 'night' && !G.tutorial && !TRIAL) return heartsOut(); return gameOver(); }
  NIGHT++; stopSession(); G.over = true; G.busy = true; G.history.push({ ...dayLine(true), end: id }); endingAch(id);
  await hook('ending', { end: id }); await showFinal(id); await quitRun(); showTitle();
}
HANDLERS.end = storyEnding;
