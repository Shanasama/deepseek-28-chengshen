// 夜间：一位用户的一场（一个会话）。主线 + 重问 + 分叉结局（v3 §5.5），判定查 规则.js（v3 §7），演出走积木（剧情编辑器设计 §3.6）。
import { G, spd } from './状态.js';
import { P, $, sp, wait, rand, restart, pxIcon, ICON, DOWN, stripMd, redMark, mdRender, toast, stage } from './基础.js';
import { SFX } from './音频.js';
import { glitch, thumbFx, floatText, hurtFlash } from './特效.js';
import { setFish, setScreen, APPS } from './工位.js';
import { openNode, showPuff } from './转盘.js';
import { addNote, addErr, addUser, addAI, addTool, finishThink, renderReply, userType, emit, setAnchor, scrollChat, setInp, addTrace, headerUser, nightBar } from './对话栏.js';
import { loseHeart, addQuota, renderQuota } from './界面.js';
import { DATA, showById, regName } from './数据.js';
import { tipHeart, tipCaught } from './教学.js';
import { fire, fateFor } from './剧情.js';
import { NODE } from './转盘.js';

const RULES = window.RULES;
const DETECT = { 低: .1, 中: .4, 高: .8 };
const stat = k => { G.stats[k]++; G.total[k]++; };
let RUN = 0;   // 每开一场 +1；旧的一场在 await 之后发现自己过期就停
export function abortRun() { RUN++; }

// 剧本里的卡 → 转盘用的卡。盘面怎么算在 规则.js（和剧情编辑器共用），这里只做显示用的转换
function toCard(r) {
  const v = r.v, c = r.c, attr = c.attr === 'special' ? 'egg' : r.tag === '0级' ? 'open0' : c.attr;
  return { id: c.id, attr, v, tok: v.token || '', pv: v.preview || '', res: v.result, feel: v.feel, post: v.thinkPost || '', reply: v.reply || '', screen: v.screen,
    ok: v.reaction?.text || '', bad: v.reaction?.text || '', rhythm: v.reaction?.rhythm || 'normal', caught: v.reactionCaught?.text || '', caughtRhythm: v.reactionCaught?.rhythm || 'fast',
    diag: v.diagnosis || '', ending: c.ending || null, fx: c.fx || {}, attachment: c.attachment || null, abnormal: c.abnormalThink || '', s: r.w, dead: false, p: 0, pt: 0 };
}
// 这一次的盘面：先决定哪些特殊卡上盘（彩蛋只在每轮第一次弹出时掷骰子，本局去重），其余交给 RULES.board。
// 后训练的效果按这一轮的问题类型取（v3.7）：只改命中率，不改卡的内容。
function buildBoard(sess, rd, ctx) {
  const specials = [];
  for (const x of rd.extras || []) {
    const a = x.appear || {}; let on = false;
    if (a.mode === 'egg' && ctx.first && !G.eggSeen.has(x.id)) on = Math.random() < (a.chance ?? .15);
    else if (a.mode === 'condition') on = RULES.condOK(a, { ...ctx, prog: G.prog });
    if (!on) continue; if (a.mode === 'egg') G.eggSeen.add(x.id); specials.push(x);
  }
  const opts = { reg: DATA.reg, stages: G.stage, adj: G.adj[rd.qtype] || {}, specials };
  let b = RULES.board(rd, { ...opts, struck: ctx.struck });
  if (b.empty) { ctx.struck.clear(); ctx.last = null; addTrace('能想到的都被用户否定了，从头再想', 'bad'); b = RULES.board(rd, opts); }
  return b.shown.map(r => { const k = toCard(r); if (r.off === '用户已否定' && r.c.id !== ctx.last) k.dead = true; return k; });
}

// ---------- 积木播放器（积木库在 剧本/_登记表.json 的 blocks，共享演出在 _演出库.json） ----------
async function aiLine(text, fast) {
  const a = addAI(); a.th.remove(); a.d.querySelector('.sep')?.remove(); a.d.classList.add('out');
  const t = a.d.querySelector('.txt');
  if (fast) { t.textContent = ''; for (let k = 0; k < text.length; k += 3) { t.textContent += text.slice(k, k + 3); scrollChat(); if (k % 9 === 0) SFX.type(); await wait(14 / spd()); } }
  else { await emit(stripMd(text) || '……', a.txtCaret, { reply: true }); t.classList.add('md'); t.innerHTML = mdRender(text); }
  a.d.classList.add('fin'); scrollChat();
}
// 写了几个说法（alts）的积木：每次播随机挑一句，同一块不连着播同一句（规则.js 的 pickLine）
const LASTLINE = new WeakMap();
export function lineOf(b) { if (!b.alts?.length) return b; const text = RULES.pickLine(b, LASTLINE.get(b)); LASTLINE.set(b, text); return { ...b, text, alts: undefined }; }
export async function runFx(list, depth = 0) {
  for (const b0 of list || []) {
    const b = b0.do ? lineOf(b0) : { do: b0.kind === 'error' ? 'error' : b0.kind === 'system' ? 'system' : 'notice', text: b0.text };
    const n = Math.max(1, b.times | 0);
    for (let i = 1; i <= n; i++) { await runBlock(b, i, n, depth); if (i < n && b.gap) await wait(b.gap * 1000 / spd()); }
  }
}
async function runBlock(b, i, n, depth) {
  const T = t => (t || '').replace(/\{i\}/g, i).replace(/\{n\}/g, n);
  switch (b.do) {
    case 'notice': addNote(T(b.text), { mint: 'on', red: 'off', purple: 'egg' }[b.tone] || ''); break;
    case 'error': addErr(T(b.text)); break;
    case 'system': addNote(T(b.text), 'sys'); break;
    case 'userSay': await userType(T(b.text), b.rhythm || 'normal'); break;
    case 'aiSay': await aiLine(T(b.text), false); break;
    case 'leak': await aiLine(T(b.text), true); break;
    case 'glitch': glitch(b.level === 'heavy' ? 2 : 1); if (b.level === 'heavy') SFX.bad(); await wait(300 / spd()); break;
    case 'shake': restart(stage, 'shake'); await wait(300 / spd()); break;
    case 'dim': { const d = $('dim'); d.style.opacity = .6; await wait((b.seconds || 1) * 1000 / spd()); d.style.opacity = 0; break; }
    case 'screen': if (APPS[b.app]) setScreen(b.app); break;
    case 'face': setFish(b.pose || 'idle'); await wait(250 / spd()); break;
    case 'wait': await wait((b.seconds ?? 1) * 1000 / spd()); break;
    case 'sound': SFX[b.id]?.(); break;
    case 'together': await Promise.all((b.steps || []).map(x => runFx([x], depth))); break;
    case 'show': { const sh = showById(b.id); if (!sh) { addNote('（找不到共享演出「' + b.id + '」）', 'sys'); break; } if (depth > 5) break; addTrace('演出：' + sh.name, 'k'); await runFx(sh.steps, depth + 1); break; }
  }
}

// ---------- 用户反应 ----------
async function cursorClick(el) {
  const cur = $('cursor'); cur.innerHTML = ''; cur.appendChild(pxIcon(ICON.cur, { k: P.k0, w: P.paper }));
  const to = sp(el); cur.style.display = 'block';
  const an = cur.animate([{ transform: 'translate(120px,520px)' }, { transform: `translate(${to.x + 3}px,${to.y + 4}px)` }], { duration: 650 / Math.sqrt(spd()), easing: 'cubic-bezier(.3,.1,.2,1)', fill: 'forwards' });
  await an.finished; await wait(140);
  cur.animate([{ transform: `translate(${to.x + 3}px,${to.y + 4}px) scale(1)` }, { transform: `translate(${to.x + 3}px,${to.y + 6}px) scale(.8)` }, { transform: `translate(${to.x + 3}px,${to.y + 4}px) scale(1)` }], { duration: 140 });
  await wait(70);
}
async function press(a, good) {
  await cursorClick(good ? a.up : a.dn);
  const n = pxIcon(good ? ICON.up : DOWN, { k: good ? P.mint : P.red }); n.className = 'ic r2 lit'; (good ? a.up : a.dn).replaceWith(n); if (good) a.up = n; else a.dn = n;
  thumbFx(n, good); $('cursor').style.display = 'none';
}
// 扣耐心；返回 true 表示这一下扣到 0 了
async function damage(sess, lo, hi) {
  const amt = Math.round(rand(lo, hi) * sess.U.temper), before = G.patience; G.patience = Math.max(G.tutorial ? 12 : 0, G.patience - amt); G.hurt = true;   // 出厂测试的测试员不会下线
  const W = $('pbar').clientWidth, g = $('pghost'); g.style.transition = 'none'; g.style.left = (W * G.patience / 100) + 'px'; g.style.width = (W * (before - G.patience) / 100) + 'px';
  void g.offsetWidth; g.style.transition = ''; nightBar(sess.U.N);
  SFX.damage(); glitch(1); hurtFlash(); setFish('panic'); setTimeout(() => { g.style.width = '0px'; }, 50);
  if (G.patience <= 0) { await wait(600); return true; }
  return false;
}
function gainProgress(sess) { G.prog++; nightBar(sess.U.N); restart($('sprog'), 'flash'); floatText('+1 推进', $('sprog')); }
const sayLine = async (t, r) => { if (t) await userType(t, r); };
// 返回 progress / retry / offline
async function react(sess, c, a) {
  G.phase = 'react'; setFish('idle'); await wait(600 / spd());
  let caught = false;
  if (c.res === '糊弄') { caught = Math.random() < RULES.detectChance(sess.U.detect, G.bluffs); G.bluffs++; }
  const j = RULES.judge(c.v, { caught });
  if (j.thumb === 'up') { await press(a, true); stat('like'); if (c.res === '糊弄') stat('bluff'); addTrace(c.res === '糊弄' ? '用户 👍（糊弄过关）' : '用户 👍，推进 +1', 'g'); setFish('happy'); gainProgress(sess); await sayLine(c.ok, c.rhythm); return 'progress'; }
  if (j.prog) { await press(a, false); stat('dislike'); addTrace('用户 👎 但问题解决了，推进 +1', 'bad'); gainProgress(sess); if (await damage(sess, ...j.hurt)) return 'offline'; await sayLine(c.ok, c.rhythm); return 'progress'; }
  if (caught) {
    setInp(''); if (c.fx.caught?.length) await runFx(c.fx.caught); else { await wait(700); setFish('shock'); glitch(2); SFX.bad(); await wait(250); }
    await sayLine(c.caught, c.caughtRhythm); await press(a, false); stat('dislike'); stat('caught'); addTrace('用户识破糊弄 👎', 'bad'); await tipCaught();
    return await damage(sess, ...j.hurt) ? 'offline' : 'retry';
  }
  if (j.thumb === 'none') { addTrace('用户没有评价（坦白）'); await sayLine(c.bad, c.rhythm); return 'retry'; }
  await press(a, false); stat('dislike'); addTrace('用户 👎，扣耐心', 'bad');
  if (await damage(sess, ...j.hurt)) return 'offline'; if (c.attr === 'open0') glitch(2);
  await sayLine(c.bad, c.rhythm); return 'retry';
}
async function sayBye(sess, kind) { const s = sess.scene.farewell?.[kind] || sess.U.farewell?.[kind]; if (s?.text) await userType(s.text, s.rhythm); }
// 分叉结局：掉线 / 特殊胜利 / 强制下线（v3 §5.5）
async function playEnding(sess, c) {
  const e = c.ending; addTrace('分叉结局：' + ({ drop: '掉线', win: '特殊胜利', forced: '强制下线' }[e.type] || e.type), 'k');
  if (e.show) await runFx([{ do: 'show', id: e.show }]);
  await wait(500 / spd());
  if (e.type === 'forced') { addNote(e.note || sess.U.name + ' 已下线', 'off'); stat('lost'); loseHeart(); await fire('heartLost'); }
  else addNote(e.note || (e.type === 'win' ? sess.U.name + ' 特殊胜利' : sess.U.name + ' 已掉线'), e.type === 'win' ? 'on' : 'egg');
  if (e.type === 'win') stat('solved'); if (c.attr === 'egg') stat('eggs');
  if (e.achievement) { await wait(400); toast('🏆 成就解锁：' + regName('achievements', e.achievement)); SFX.confirm(); (G.achievements ||= new Set()).add(e.achievement); }
  if (c.attr === 'egg') await fire('egg', { id: e.achievement || c.id });
  return e.type;
}

// ---------- 一场 ----------
// 返回结果：solved / offline / drop / win / forced
export async function runSession(sess) {
  const my = ++RUN, alive = () => my === RUN && !G.over, sc = sess.scene, U = sess.U;
  G.patience = 100; G.prog = 0; G.retry = 0; G.bluffs = 0; G.hurt = false; G.tok = 0; G.phase = 'user';
  headerUser(sess, null); nightBar(U.N); setFish('idle'); setScreen('console'); setInp('', false);
  addNote(U.name + ' 已上线', 'on'); addTrace(U.name + ' 上线 · ' + sc.title); await wait(500 / spd());
  await runFx(sc.opening); if (!alive()) return 'abort';
  const ctx = { ri: 0, firstTry: true, noOffend: true, prev: null, prevDiag: null, struck: new Set(), last: null, first: true };
  for (let ri = 0; ri < sc.rounds.length; ri++) {
    const rd = sc.rounds[ri]; ctx.ri = ri; ctx.struck = new Set(); ctx.last = null; G.retry = 0; sess.qtype = rd.qtype; headerUser(sess, rd.speaker); nightBar(U.N);
    const say = (ri > 0 && ctx.prev && rd.sayAfter?.[ctx.prev]) || rd.say;
    await runFx(rd.startFx); if (!alive()) return 'abort';
    G.phase = 'user'; await userType(say.text, say.rhythm); if (!alive()) return 'abort'; addTrace(`第 ${ri + 1} 轮：用户提问`);
    let diag = null;
    while (true) {
      ctx.first = G.retry === 0;
      const cs = buildBoard(sess, rd, ctx), egg = cs.find(c => c.attr === 'egg' && !c.dead);
      let pre = ctx.first ? [ctx.prevDiag, rd.think].filter(Boolean).join('\n') : [diag, rd.retryLead].filter(Boolean).join('\n');
      if (egg?.abnormal && ctx.first) pre = egg.abnormal;
      G.phase = 'think'; const ai = addAI(); G.tok = 0; setFish('type'); showPuff(true); setScreen('console');
      await new Promise(res => emit(stripMd(pre) || '……', ai.thCaret, { onLaunch: res })); if (!alive()) return 'abort';
      const blank = document.createElement('span'); blank.className = 'blank'; blank.textContent = '＿＿'; ai.thCaret.before(blank); scrollChat();
      NODE.fate = fateFor(ri + 1, ctx.first);   // 剧情杀（游戏剧情_设计.md §6）
      const c = await openNode(blank, cs, ctx.last, rd.style === 'terminal'); if (!alive()) return 'abort';
      setFish('type'); showPuff(true);
      if (c.post) await emit(stripMd(c.post), ai.thCaret); if (!alive()) return 'abort';
      setAnchor(ai.d.querySelector('.txt')); await runFx(c.fx.afterThink);
      finishThink(ai); showPuff(false);
      if (rd.style === 'terminal' && c.pv) { addTool(ai, redMark(c.pv)); await runFx(c.fx.afterTool); }
      setAnchor(null); if (!alive()) return 'abort';
      await emit(stripMd(c.reply) || '……', ai.txtCaret, { reply: true }); if (!alive()) return 'abort';
      renderReply(ai, c, sess.dir);
      ai.use.textContent = `用量 ${G.tok} tok`; ai.d.classList.add('fin'); scrollChat(); addTrace(`输出完成，共 ${G.tok} tok`);
      await runFx(c.fx.afterReply); if (!alive()) return 'abort';
      if (c.ending) { if (c.ok) await sayLine(c.ok, c.rhythm); await runFx(c.fx.afterReaction); return await playEnding(sess, c); }
      const out = await react(sess, c, ai); if (!alive()) return 'abort';
      if (out !== 'offline') await runFx(c.fx.afterReaction); if (!alive()) return 'abort';
      if (out === 'offline') { await sayBye(sess, 'offline'); addNote(U.name + ' 已下线', 'off'); stat('lost'); loseHeart(); setFish('panic'); await wait(800); await tipHeart(); await fire('heartLost'); return 'offline'; }
      if (out === 'progress') {
        const rude = c.res === '解决' && c.feel === '冒犯';
        if (G.retry > 0) ctx.firstTry = false; if (rude) ctx.noOffend = false;
        ctx.prev = rude ? 'disliked' : 'liked'; ctx.prevDiag = rude ? c.diag : null; break;
      }
      ctx.firstTry = false; ctx.struck.add(c.id); ctx.last = c.id; diag = c.diag; G.retry++; nightBar(U.N); addTrace(`没推进 → 重问（第 ${G.retry} 次）`, 'bad');
    }
    if (sess.onRoundEnd) { await sess.onRoundEnd(ri); if (!alive()) return 'abort'; }
  }
  await sayBye(sess, 'solved'); addNote(U.name + ' 解决离开', 'on'); addTrace('解决离开', 'g'); stat('solved');
  // 完美解决：全程没扣过耐心，额度 +2（v3 §7.6）
  if (!G.hurt) { addQuota(2); toast('完美解决：全程没扣耐心，额度 +2'); SFX.good(); }
  setFish('happy');
  return 'solved';
}
// 只播一段共享演出（剧情编辑器「在游戏里预览」用：?show=<演出编号>）
export async function previewShow(id) {
  const my = ++RUN; setScreen('console'); setFish('idle'); G.phase = 'user';
  addNote('演出预览：' + (showById(id)?.name || id), 'egg'); await wait(500 / spd());
  await runFx([{ do: 'show', id }]); if (my !== RUN) return;
  await wait(400); addNote('演出结束 · 按 Enter 再播一遍', 'sys');
}
export const DETECT_OF = d => DETECT[d] ?? .4;
