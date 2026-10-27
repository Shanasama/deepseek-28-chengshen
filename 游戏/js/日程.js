// 日程：一天一天往下走。白天 → 开始营业 → 一晚几位用户接连上线（一位一个会话）→ 每晚结算 → 下一天。
// 每天的安排全在 剧本/_日程表.json；3 天 Demo 和 28 天本体是同一套代码，只是表的行数不同。
import { G, QT, freshStats, spd } from './状态.js';
import { $, wait, wt, shuffle, pick, restart, toast } from './基础.js';
import { SFX } from './音频.js';
import { setFish, drawRoomItems } from './工位.js';
import { newConv, showConv, writeTo, clearConvs, addNote, fishSay, setInp, clearFlights } from './对话栏.js';
import { setMode, renderHUD, renderAP, renderClock, renderDrawer, setUrl, HOME, wipe, drawer, setSessionPicker, renderQueue } from './界面.js';
import { closeNode, NODE } from './转盘.js';
import { snapPrev } from './训练.js';
import { DATA, loadScene } from './数据.js';
import { runSession, abortRun, DETECT_OF } from './夜间.js';
import { view, bubble, dayToday } from './白天.js';
import { showReport, showEnd, renderSelf } from './报告.js';

const days = () => DATA.sched.days.filter(d => !d.skip);
const lastDay = () => Math.max(...days().map(d => d.day));
const nextDayOf = n => days().map(d => d.day).filter(d => d > n).sort((a, b) => a - b)[0];

// ---------- 开新一局 ----------
export function newGame() {
  const s = DATA.sched.start;
  Object.assign(G, {
    hearts: s.hearts, heartMax: s.heartMax, quota: s.quota, quotaMax: s.quotaMax, rollbacks: s.rollbacks, tiboUsed: false, over: false,
    stage: { ...s.stage }, adj: JSON.parse(JSON.stringify(s.adj || {})), done: {}, used: {}, eggSeen: new Set(), achievements: new Set(),
    total: freshStats(), stats: freshStats(), sessions: [], cur: -1,
  });
  QT.forEach(t => { G.adj[t] = G.adj[t] || {}; });
  setSessionPicker(pickSession); clearConvs(); startDay(days()[0].day);
}

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
  await wipe(true); setMode('night'); G.stats = freshStats();
  // 一位用户一个会话
  G.sessions = await Promise.all(G.tonight.map(async v => {
    const u = v.entry.user, scene = await loadScene(v.dir, v.file);
    return { visitor: v, dir: v.dir, file: v.file, scene, user: u, status: 'queue', result: null, conv: newConv(),
      U: { name: u.name, type: u.type, bio: u.bio || '', avatar: u.avatar, temper: u.temper || 1, detect: DETECT_OF(u.detect), farewell: u.farewell || {}, N: scene.rounds.length } };
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
    if (G.hearts <= 0 && DATA.sched.start.heartsOutEnds) { await wait(900); return gameOver(); }
    await wait(1400 / spd());
  }
  G.cur = -1; renderQueue(); setFish('idle');
  await wait(700); const last = G.day >= lastDay();
  await showReport(last);
  if (last) return showEnd('demo', restartGame);
  await wipe(true); startDay(nextDayOf(G.day)); await wipe(false); SFX.morning();
}
// 开发面板：跳过当前用户
export function skipCurrent() { if (G.mode !== 'night' || G.cur < 0) return; G.skipping = true; abortRun(); if (NODE.state !== 'hidden') closeNode(); clearFlights(); $('cursor').style.display = 'none'; }
// 回看已经结束的会话（只能看）
function pickSession(i) {
  const s = G.sessions[i]; if (!s) return;
  if (s.status === 'queue') return toast('还没轮到 ta');
  showConv(s.conv); drawer(false);
  if (i !== G.cur) toast('正在回看（只能看）· 点「进行中」的会话回去');
}

// ---------- 整局结束 ----------
function gameOver() { G.over = true; abortRun(); if (NODE.state !== 'hidden') closeNode(); clearFlights(); showEnd('hearts', restartGame); }
async function restartGame() { NIGHT++; abortRun(); if (NODE.state !== 'hidden') closeNode(); clearFlights(); await wipe(true); newGame(); await wipe(false); }
