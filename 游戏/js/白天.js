// 白天：大肥鱼的自由活动（v3 §3.3）。白天活动是登记出来的，日程表按天开放；加新玩法 = 在 ACTS 里加一项 + 实现它的 run。
import { G, QT, AXES } from './状态.js';
import { P, AT, $, sp, wt, wait, pick, shuffle, fmt, restart, pxIcon, ICON, toast, deny, deskXY, stage, DESK_DY } from './基础.js';
import { SFX } from './音频.js';
import { parts, confetti, ring, burst, floatAt, vignette, glitch, shake, flash, banner } from './特效.js';
import { setFish, setScreen, drawRoomItems, POP, DESK_Y, MON, DEV } from './工位.js';
import { youSay, fishSay, addLog, flyWord, scrollChat } from './对话栏.js';
import { renderAP, renderHUD, spendAP, spendQuota, dropHeart, setUrl, HOME, advanceClock, on, confirmBox, renderClock } from './界面.js';
import { pt, w, trainOne, pickPair, pickQuestions, isNoise, tagName, gib, learn } from './训练.js';
import { mkRadar, retargetRadar, radarPt, radarLabels, radarStatic } from './六维图.js';
import { DATA } from './数据.js';
import { holds } from './立绘.js';
import { spot, tipOnce } from './教学.js';
import { startNight } from './日程.js';
import { renderSelf } from './报告.js';
import { hook, fire } from './剧情.js';

const WORDS = { knowledge: ['瑞利散射', '是指', '也称', '词条', '参见', '定义', '研究表明', '光合作用', '引力'], colloquial: ['哈哈哈', '绝了', '家人们', '笑死', '离谱', '顶', '蹲', '6', '好家伙'],
  narrative: ['月光', '她说', '忽然', '那一夜', '风', '回眸', '……', '第一章', '雨'], logic: ['if', 'return', '步骤 1', 'for', 'def', '→', '条件', 'else', '{ }'],
  formal: ['您好', '感谢', '请', '根据规定', '特此', '第一条', '敬请谅解', '兹'], open: ['awsl', 'yyds', '草', '前方高能', '2333', 'dddd', '绷不住了', '典', '蚌'] };
const bv = $('bv');
export const dayToday = () => DATA.sched.days.find(d => d.day === G.day) || {};
const lock = on_ => { G.busy = on_; stage.classList.toggle('busy', on_); renderAP(); };

// 白天活动登记表
export const ACTS = [
  { id: 'pretrain', name: '预训练', say: '去读点东西', icon: () => pxIcon(ICON.book, { k: P.ink, B: P.cobalt, w: P.paper, G: P.lgold }, 2), desc: '挑一类网站读一整天，学会一种新说法',
    why: () => AXES.every(a => G.stage[a] >= 2) ? '语料都学满了' : null, sub: () => `${AXES.reduce((s, a) => s + G.stage[a], 0)}/12 层`, run: () => view('pre') },
  { id: 'posttrain', name: '后训练', say: '练练回答', icon: () => pxIcon(ICON.scale, { k: P.ink, G: P.g2, A: P.mint, B: P.rose }, 2), desc: '挑一类问题，在两个回答里选更好的',
    why: () => G.post >= G.postMax ? '今天练够了' : null, sub: () => `今日 ${G.post}/${G.postMax}`, run: () => view('ptype') },
  { id: 'eat', name: '吃白饭', say: '吃白饭', icon: () => pxIcon(ICON.bowl, { k: P.ink, w: P.paper, B: P.cobalt }, 2), desc: '什么也不干，白吃一顿，心 +1',
    why: () => G.hearts >= G.heartMax ? '吃不下了' : null, sub: () => `心 ${G.hearts}/${G.heartMax}`, run: () => eat() },
];
// 日程表按天开放；剧情在这一局开过 / 关过的以剧情为准（G.story.acts）
const enabled = () => { const ids = dayToday().activities, ov = G.story.acts || {}; return ACTS.filter(a => ov[a.id] ?? (!ids || ids.includes(a.id))); };
const canAct = a => G.ap < 1 ? '行动点用完了' : a.why();

// ---------- 思考气泡 ----------
export function bubble(show) { $('bubble').classList.toggle('show', show); document.querySelectorAll('.tail').forEach(t => t.classList.toggle('show', show)); if (show) SFX.blip(); }
function paint(html) {
  bv.innerHTML = html; restart(bv, 'swap');
  bv.querySelectorAll('.act,.cb,.tc,.srow').forEach((e, i) => setTimeout(() => { e.classList.add('in'); if (e.classList.contains('srow')) SFX.step(i); }, 40 + i * 60));
  bv.querySelectorAll('.act:not(.dis),.cb:not(.full),.tc').forEach(e => e.addEventListener('mouseenter', () => SFX.hover()));
}
const header = (lbl, cap, back) => `<div class="bh"><span class="lbl"><i></i>${lbl}</span><span class="sp"></span><span class="cap">${cap || ''}</span>${back ? '<span class="back r2" data-back>← 返回 Esc</span>' : ''}</div>`;
function hitFx(el, col) { if (!el) return; restart(el, 'hit'); restart($('bflash'), 'on'); restart($('bubble'), 'punch'); const p = sp(el); burst(p.x + p.w / 2, p.y + p.h / 2, col || P.lgold, 26, 200); ring(p.x + p.w / 2, p.y + p.h / 2, col || P.gold, 24, 150); SFX.select(); setFish('pick'); }
export function view(v, arg) {
  G.view = v;
  if (v === 'menu') {
    const acts = enabled();
    paint(header('今天干点啥？', `Day ${G.day} · ${fmt(G.clock)}`) + '<div class="acts2">' + acts.map((a, i) => { const why = canAct(a);
      return `<div class="act r8${why ? ' dis' : ''}"><span class="kb key r2">${i + 1}</span><div class="ico"></div><div class="nm">${a.name}</div><div class="ds">${a.desc}</div>
        <div class="ft"><span class="cost r2">1 行动点</span>${why ? `<span class="why">${why}</span>` : `<span>${a.sub()}</span>`}</div></div>`; }).join('') + '</div>'
      + `<div class="bf"><span class="sp"></span><span id="gobtn" class="r4">开始营业 <span class="key r2">Enter</span></span></div>`);
    bv.querySelectorAll('.act').forEach((el, i) => { el.querySelector('.ico').appendChild(acts[i].icon()); el.onclick = () => pickAct(acts[i], el); });
    $('gobtn').onclick = e => { e.stopPropagation(); SFX.click(); goNight(); }; renderAP();
  }
  if (v === 'pre') {
    paint(header('预训练 · 挑一类语料来读', '1 行动点', true) + '<div class="cgrid">' + AXES.map(a => { const A = AT[a], st = G.stage[a], full = st >= 2;
      const badge = a === 'open' && !st ? ['0 级', ''] : [['未解锁', ''], ['浅层', 's1'], ['深层', 's2']][st];
      return `<div class="cb r4${full ? ' full' : ''}" data-a="${a}"><div class="l1"><i class="cc" style="background:${A.c}"></i>${A.n}<span class="st r2 ${badge[1]}">${badge[0]}</span></div>
        <div class="site">${A.site}</div><div class="nx">${full ? '已经学满了' : `读完 → <b>${st ? '深层' : '浅层'}「${A.lv[st]}」</b>`}</div></div>`; }).join('') + '</div>');
    bv.querySelectorAll('.cb').forEach(el => { el.onclick = () => { const a = el.dataset.a; if (G.busy) return; if (G.stage[a] >= 2) return deny('这类语料已经学满了', el); hitFx(el, AT[a].c); pretrain(a); }; });
    if (arg) { const el = bv.querySelector(`[data-a="${arg}"]`); if (el) setTimeout(() => restart(el, 'flash'), 250); }
    setTimeout(() => tipOnce('pre', 'bubble', '预训练：挑一类网站去读。读了哪类，夜里转盘上就多哪类卡；读第二次学到深层，卡会换成更好的版本。'), 300);
  }
  if (v === 'ptype') {
    paint(header('后训练 · 练哪一类问题？', `1 行动点 · 连做 ${pt().perBatch} 题`, true) + `<div class="tgrid${QT.length > 5 ? ' two' : ''}" style="grid-template-columns:repeat(${QT.length > 5 ? Math.ceil(QT.length / 2) : QT.length},1fr)">` + QT.map(t =>
      `<div class="tc r8${t.length > 2 ? ' long' : ''}" data-t="${t}"><div class="nm">${t}</div><canvas width="64" height="64"></canvas><div class="n">练过 ${G.done[t] || 0} 题</div></div>`).join('') + '</div>');
    bv.querySelectorAll('.tc').forEach(el => { radarStatic(el.querySelector('canvas'), el.dataset.t); el.onclick = () => { if (G.busy) return; hitFx(el, P.cobalt); postTrain(el.dataset.t); }; });
    setTimeout(() => tipOnce('post', 'bubble', '后训练：挑一类问题来练，每道题两个回答选一个。在同一类问题上越常选它，夜里这类问题的转盘上它越容易被转到。'), 300);
  }
  bv.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { SFX.click(); view('menu'); });
}
function pickAct(a, el) { if (G.busy || performance.now() - G.startT < 500) return; const why = canAct(a); if (why) return deny(why, el); hitFx(el, P.gold); a.run(); }
export function pickActByIndex(i) { const a = enabled()[i]; if (a) { bubble(true); pickAct(a, bv.querySelectorAll('.act')[i]); } }

// ---------- 预训练 ----------
async function pretrain(a) {
  if (G.busy) return; if (G.ap < 1) return deny('行动点用完了');
  const A = AT[a], lv = G.stage[a]; lock(true); spendAP();
  await hook('beforeAct', { act: 'pretrain' });
  await youSay(pick([`今天去${A.site}读读吧。`, `去${A.site}泡一会儿？`]));
  bubble(false); fishSay(A.go); await wt(500);
  setUrl(`dafeiyu://corpus/<b>${A.slug}</b>`, true); SFX.page(); await wt(300);
  setScreen(A.app); setFish('read'); SFX.launch(); G.musHype = true; $('dim').classList.add('read');
  $('progt').textContent = '正在读取：' + A.site; $('prog').classList.add('on');
  const sp_ = Math.max(.5, [.5, 1, 2, 3][G.spd]), dur = 3000 / sp_, t0 = performance.now(); let last = 0, n = 0;
  while (true) {
    const k = (performance.now() - t0) / dur; if (k >= 1) break;
    $('progb').style.width = (k * 100) + '%'; $('progn').textContent = (k * (lv ? 2.4 : 1.2)).toFixed(1) + 'M tokens';
    const gap = (110 - k * 80) / sp_;   // 越读越快
    if (performance.now() - last > gap) { last = performance.now(); flyWord(pick(WORDS[a]), A.c); if (k > .5) flyWord(pick(WORDS[a]), A.c); SFX.word(); DEV.glow = 1; DEV.flash = 1; G.tok = Math.min(999, G.tok + 7); if (++n % 6 === 0) shake(); }
    await wait(16);
  }
  $('progb').style.width = '100%'; $('progn').textContent = (lv ? 2.4 : 1.2).toFixed(1) + 'M tokens'; await wt(350); $('prog').classList.remove('on'); $('dim').classList.remove('read'); G.musHype = false;
  learn(a); if (lv === 1) await fire('deepFirst', { attr: a });   // 事件挂点「某属性第一次到深层」
  flash(); shake(true); drawRoomItems(); const p = deskXY(...POP[a]); ring(p.x, p.y, A.c, 40, 190); burst(p.x, p.y, A.c, 50, 260); confetti(p.x, p.y, 40); floatAt('啪！', p.x - 14, p.y - 26, P.ink, true);
  SFX.unlock(); vignette('gold'); setFish('happy'); banner(`${lv ? '深层' : '浅层'}解锁 · ${A.n}`, `学会了「${A.lv[lv]}」`, A.c === P.g3 ? P.mist : A.c);
  addLog(`预训练完成 · ${A.n} → ${lv ? '深层' : '浅层'}「${A.lv[lv]}」`, 'k');
  await wt(900); await fishSay('学会了「' + A.lv[lv] + '」！' + (a === 'knowledge' ? '书架又满了一层。' : '房间里又多了点东西。'));
  await advanceClock(120); await wt(300);
  setUrl(HOME(), true); setScreen('idle'); setFish('idle'); G.tok = 0; await hook('afterAct', { act: 'pretrain' }); lock(false); renderSelf(); view('menu'); bubble(true);
}

// ---------- 后训练（按问题类型分开算） ----------
let KEYQ = null, KEYR = null, KEYSUM = null, RQ = null;
export const dayKeys = () => ({ KEYQ, KEYR, KEYSUM });
async function postTrain(t) {
  if (G.busy) return; if (G.ap < 1) return deny('行动点用完了'); if (G.post >= G.postMax) return deny('今天练够了');
  lock(true); spendAP(deskXY(380, 150)); G.post++; renderAP();
  await hook('beforeAct', { act: 'posttrain' });
  await youSay(pick([`练练${t}类的问题吧。`, `来几道${t}类的题。`]));
  fishSay('来吧，出题！我会认真挑的。');
  setUrl(`dafeiyu://rlhf/<b>${t}</b>`, true); setScreen('rlhf');
  const before = Object.fromEntries(AXES.map(a => [a, w(t, a)]));
  const qs = pickQuestions(t, pt().perBatch);
  for (let i = 0; i < qs.length; i++) await askOne(t, qs[i], i, qs.length);
  G.done[t] = (G.done[t] || 0) + qs.length;
  const ch = AXES.filter(a => before[a] != null && Math.abs(w(t, a) - before[a]) > .001);
  addLog(`后训练完成 · ${t}类 ${qs.length} 题：` + (ch.map(a => `${AT[a].s}${w(t, a) > before[a] ? '↑' : '↓'}`).join(' ') || '没变化'), 'g');
  await summary(t, before, ch);
  const up = ch.filter(a => w(t, a) > before[a]).sort((x, y) => (w(t, y) - before[y]) - (w(t, x) - before[x]))[0];
  await fishSay(up ? `记住了！今晚再遇到${t}类的问题，我会更容易想到「${AT[up].n}」的说法。` : `${t}类问题……好像没练出什么来。`);
  await advanceClock(120); setUrl(HOME(), true); setScreen('idle'); await hook('afterAct', { act: 'posttrain' }); lock(false); renderSelf(); view('menu');
}
function askOne(t, q, i, n, fixed) {
  return new Promise(done => {
    let pair = fixed ? fixed.slice() : pickPair();
    paint(header(`后训练 · ${t}类`, `第 ${i + 1}/${n} 题`)
      + `<div class="qwrap"><div class="qleft"><div class="qq r4"><div class="who">用户问：</div></div><div class="ans"></div>
        <div style="display:flex"><span id="reroll" class="r2"><i class="qc r2"></i>换一对 · ${pt().rerollCost} 额度 <span class="key r2">R</span></span></div></div>
        <div class="qright" id="qr"><canvas width="128" height="128"></canvas><div class="cap"><div>${t}类 · 六维图</div><div class="dots3">${Array.from({ length: n }, (_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div></div></div></div>`);
    bv.querySelector('.qq').append(q.q);
    const qr = $('qr'); RQ = mkRadar(qr.querySelector('canvas'), 128, t); radarLabels(qr, RQ, 4, 12);
    let chosen = false, busy = false;
    const answer = a => isNoise(a) ? (q.a.open0 || gib()) : q.a[a];
    const fill = () => {
      const box = bv.querySelector('.ans'); box.innerHTML = pair.map((a, k) => `<div class="an r4${isNoise(a) ? ' noise' : ''}" style="--ac:${AT[a].c}"><span class="tag r2">${tagName(a)}</span><div class="tx"></div><span class="k">${k ? '→ 或 B' : '← 或 A'}</span><i class="wf"></i></div>`).join('');
      box.querySelectorAll('.an').forEach((el, k) => { el.querySelector('.tx').textContent = answer(pair[k]); el.onclick = () => choose(k); el.onmouseenter = () => SFX.hover(); setTimeout(() => { el.classList.add('in'); SFX.step(k + 2); }, 60 + k * 90); });
      $('reroll').classList.toggle('dis', G.quota < pt().rerollCost);
    };
    // 花控盘额度换一对回答：同一道题，重抽两个属性
    const reroll = () => {
      if (chosen || busy) return; if (G.quota < pt().rerollCost) { deny('额度用完了', $('reroll')); return; }
      busy = true; const box = bv.querySelector('.ans'), pb = sp(box);
      spendQuota({ x: pb.x + pb.w / 2, y: pb.y + 20 }, () => {
        bv.querySelectorAll('.an').forEach(e => e.classList.add('out')); glitch(); SFX.shuffle(); burst(pb.x + pb.w / 2, pb.y + pb.h / 2, P.sky, 30, 180);
        addLog(`换了一对回答 · 额度 −${pt().rerollCost}`, 'q');
        setTimeout(() => { pair = pickPair(pair); fill(); busy = false; }, 220);
      }, pt().rerollCost);
    };
    const choose = k => {
      if (chosen || busy) return; chosen = true; KEYQ = null; KEYR = null; bv.classList.add('lock');
      const win = pair[k], lose = pair[1 - k], els = bv.querySelectorAll('.an'); els[k].classList.add('win'); els[1 - k].classList.add('lose');
      const { dWin: dw, dLose: dl } = trainOne(t, win, lose);
      SFX.pick(); setTimeout(SFX.toss, 120); shake(true); restart($('bubble'), 'punch'); const pe = sp(els[k]); burst(pe.x + pe.w / 2, pe.y + pe.h / 2, AT[win].c, 40, 260); ring(pe.x + pe.w / 2, pe.y + pe.h / 2, AT[win].c, 30, 190);
      const pl = sp(els[1 - k]); for (let j = 0; j < 18; j++) parts.push({ x: pl.x + Math.random() * pl.w, y: pl.y + Math.random() * pl.h, vx: (Math.random() - .5) * 120, vy: Math.random() * 120 - 40, g: 400, c: j % 3 ? P.g3 : P.red, life: .4 + Math.random() * .4, s: 2 });
      floatAt('+' + dw.toFixed(2), pe.x + pe.w / 2 - 20, pe.y - 8, P.good, true);
      setTimeout(() => {
        retargetRadar(RQ); const iw = AXES.indexOf(win), il = AXES.indexOf(lose); RQ.pulse[iw] = 1; RQ.pulse[il] = -1;
        const vw = radarPt(RQ, iw), vl = radarPt(RQ, il); ring(vw.x, vw.y, AT[win].c, 20, 100); floatAt('+' + dw.toFixed(2), vw.x + 6, vw.y - 10, P.good); SFX.grow();
        if (Math.abs(dl) > .001) { floatAt(dl.toFixed(2), vl.x + 6, vl.y - 10, P.red); setTimeout(SFX.shrink, 160); } else floatAt('保底', vl.x + 6, vl.y - 10, P.g2);
        addLog(`第 ${i + 1} 题 · 选了「${tagName(win)}」+${dw.toFixed(2)} · 「${tagName(lose)}」${dl.toFixed(2)}`, 'q');
      }, 300);
      setTimeout(() => { bv.classList.remove('lock'); done(); }, 1500 / Math.max(1, [.5, 1, 2, 3][G.spd] * .7));
    };
    fill(); $('reroll').onclick = reroll; KEYQ = choose; KEYR = fixed ? null : reroll; if (fixed) $('reroll').style.display = 'none';
  });
}
function summary(t, before, ch, nq) {
  return new Promise(done => {
    paint(header(`后训练完成 · ${t}类`, '只影响' + t + '类')
      + `<div class="qwrap"><div class="qleft"><div class="sum">` + (ch.length ? ch.map(a => { const d = w(t, a) - before[a];
        return `<div class="srow r2" data-a="${a}"><i class="cc" style="background:${AT[a].c}"></i>${AT[a].n}<span class="v">${before[a].toFixed(2)} → <span class="nv">${before[a].toFixed(2)}</span></span><span class="d ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${d.toFixed(2)}</span></div>`; }).join('')
        : '<div class="srow r2">这一轮的选择互相抵消了，没变化</div>')
      + `</div><div class="t3" style="margin-top:8px;color:var(--g2)">分数越高，夜里${t}类问题的盘面上它的扇区越大。<br>落选的那边被压下去了——这就是对齐税。</div></div>`
      + `<div class="qright" id="qr"><canvas width="128" height="128"></canvas><div class="cap">虚线 = 今天开始时</div></div></div>`
      + `<div class="bf"><span class="sp"></span><span class="btn2 r2" id="sumok">好的 <span class="key r2">Enter</span></span></div>`);
    const qr = $('qr'); RQ = mkRadar(qr.querySelector('canvas'), 128, t); radarLabels(qr, RQ, 4, 12);
    banner(`训练完成 · ${t}类`, `${nq || pt().perBatch} 题`, P.mint); SFX.levelup(); vignette(); const bp = sp($('bubble')); confetti(bp.x + bp.w / 2, bp.y + 40, 50);
    bv.querySelectorAll('.srow[data-a]').forEach((r, i) => { const a = r.dataset.a, from = before[a], to = w(t, a), el = r.querySelector('.nv'); const t0 = performance.now() + 200 + i * 160;
      (function step(now) { const k = Math.max(0, Math.min(1, (now - t0) / 500)); el.textContent = (from + (to - from) * k).toFixed(2); if (k < 1) requestAnimationFrame(step); else { const p = sp(el); ring(p.x + 12, p.y + 8, to > from ? P.mint : P.red, 12, 70); } })(performance.now()); });
    const fin = () => { KEYSUM = null; SFX.click(); done(); }; $('sumok').onclick = fin; KEYSUM = fin;
  });
}

// ---------- 出厂测试的最后一题（第 1 天早上第一件事，免费，固定「活泼 vs 官腔」） ----------
export async function tutorialQuestion(q) {
  lock(true); bubble(true); const t = q.qtype;
  await fishSay('出厂测试还剩最后一题！测试员留下了两个回答，你帮我挑一个更好的。');
  setUrl(`dafeiyu://rlhf/<b>${t}</b>?tutorial`, true); setScreen('rlhf');
  const before = Object.fromEntries(AXES.map(a => [a, w(t, a)]));
  const p = askOne(t, q, 0, 1, q.pair);
  await spot('bubble', `这就是「后训练」：同一个问题，两个回答选一个。选中的说法，以后在${t}类问题上更容易被转到；落选的会被压下去。`);
  await p; G.done[t] = (G.done[t] || 0) + 1;
  const ch = AXES.filter(a => before[a] != null && Math.abs(w(t, a) - before[a]) > .001);
  addLog(`出厂测试 · 最后一题（${t}类）：` + (ch.map(a => `${AT[a].s}${w(t, a) > before[a] ? '↑' : '↓'}`).join(' ') || '没变化'), 'g');
  await summary(t, before, ch, 1);
  await fishSay('出厂测试全部通过！今天开始正式营业。');
  setUrl(HOME(), true); setScreen('idle'); lock(false); renderSelf(); view('menu');
}

// ---------- 编辑器「后训练」模块的试做（?后训练预览=1）：编辑器送来一道题和一对属性，做完看六维图，不存档 ----------
export function trialIdle() { bubble(true); paint(header('后训练 · 试做', '编辑器预览') + '<div class="t3" style="margin-top:10px;color:var(--g2)">在编辑器里选好一对回答，点「试做这道题」。</div>'); }
export async function trialQuestion(q, pair) {
  if (G.busy) return; lock(true); bubble(true); const t = q.qtype;
  setUrl(`dafeiyu://rlhf/<b>${t}</b>?preview`, true); setScreen('rlhf');
  const before = Object.fromEntries(AXES.map(a => [a, w(t, a)]));
  await askOne(t, q, 0, 1, pair);
  const ch = AXES.filter(a => before[a] != null && Math.abs(w(t, a) - before[a]) > .001);
  await summary(t, before, ch, 1);
  setUrl(HOME(), true); setScreen('idle'); lock(false); trialIdle();
}

// ---------- 吃白饭 ----------
async function eat() {
  if (G.busy) return; if (G.ap < 1) return deny('行动点用完了'); if (G.hearts >= G.heartMax) return deny('吃不下了');
  await tipOnce('eat', 'hud', '吃白饭：花 1 个行动点，心 +1（最多 ' + G.heartMax + ' 颗）。心是整局共用的，夜里用户下线就扣。');
  lock(true); spendAP(); await hook('beforeAct', { act: 'eat' }); await youSay(pick(['去吃点东西吧，别饿着。', '吃饭时间到！']));
  bubble(false); fishSay('白饭！我来了！嗷呜——'); await wt(400);
  setUrl('dafeiyu://<b>waimai</b>/order/白饭×1', true); setScreen('eat'); showBowl(true); SFX.thud(); const bp = deskXY(128, DESK_Y - 12); ring(bp.x, bp.y, P.paper, 20, 90); setFish('eat');
  for (let i = 0; i < 9; i++) {
    SFX.munch(); const p = deskXY(120, 300 + DESK_DY); if (i % 2 === 0) floatAt(pick(['嗷呜', '吧唧', '香！', '嚼嚼', '好吃！']), p.x + Math.random() * 50 - 20, p.y + Math.random() * 20 - 10, P.gold, i === 8);
    for (let k = 0; k < 5; k++) parts.push({ x: bp.x + Math.random() * 20 - 10, y: bp.y - 10, vx: Math.random() * 140 - 70, vy: -60 - Math.random() * 80, g: 420, c: k % 2 ? P.paper : P.mist, life: .4 + Math.random() * .3, s: 2 }); await wt(200);
  }
  showBowl(false); setFish('happy'); SFX.heartIn(); await dropHeart(); G.hearts = Math.min(G.heartMax, G.hearts + 1); renderHUD(); $('hearts').lastChild.classList.add('in');
  const hp = sp($('hearts').lastChild); ring(hp.x + 5, hp.y + 5, P.rose, 28, 120); burst(hp.x + 5, hp.y + 5, P.rose, 30, 180); floatAt('心 +1', hp.x - 20, hp.y - 20, P.rose, true); vignette('pink'); shake();
  addLog(`吃白饭 · 心 +1（${G.hearts}/${G.heartMax}）`, 'h');
  await fishSay('嗝。吃饱了！今晚多扛一个用户没问题。');
  await advanceClock(60); await wt(300); setUrl(HOME(), true); setScreen('idle'); setFish('idle'); await hook('afterAct', { act: 'eat' }); lock(false); view('menu'); bubble(true);
}
// 桌上的白饭碗；立绘的 eat 把碗画在她手里时桌上不放
function showBowl(on_) { const c = $('eat').getContext('2d'); c.clearRect(0, 0, 600, 486); if (!on_ || holds('eat')) return; const b = pxIcon(ICON.bowl, { k: P.ink, w: P.paper, B: P.cobalt }, 2); c.imageSmoothingEnabled = false; c.drawImage(b, 108, DESK_Y - 24, 40, 24); }

// ---------- 开始营业 ----------
export async function goNight({ ask = true } = {}) {   // ask：还有行动点时先问一句（开发面板的「马上开始营业」不问）
  if (G.busy) return;
  if (ask && G.ap > 0) { if (!(await confirmBox(`还有 ${G.ap} 个行动点没用`, '今天的行动点不会留到明天。确定开始营业吗？', '开始营业'))) return; }
  lock(true); await youSay('开始营业吧。'); bubble(false); setFish('stretch'); SFX.stretch();
  fishSay('伸个懒腰……好！今晚的用户们，来吧！'); addLog('开始营业', 'k');
  const from = G.clock, to = 18 * 60 + 40, t0 = performance.now();
  while (true) { const k = Math.min(1, (performance.now() - t0) / (1700 / [.5, 1, 2, 3][G.spd])); G.clock = Math.round(from + (to - from) * k); renderClock(); if (k >= 1) break; await wait(30); }
  await hook('beforeNight'); if (G.mode !== 'day') return;
  lock(false); startNight();
}

// ---------- 输入框的快捷菜单、房间里能点的东西 ----------
export function openMenu() {
  if (G.mode !== 'day') return; if (G.busy) return toast('她正忙着呢');
  const acts = enabled(), m = $('m-act');
  m.innerHTML = '<div class="mh">让大肥鱼……</div>' + acts.map((a, i) => { const why = canAct(a); return `<div class="it r2${why ? ' dis' : ''}" data-i="${i}"><span class="kk r2">${i + 1}</span>${a.say}<span class="t3">${why || '1 行动点'}</span></div>`; }).join('')
    + `<div class="it r2" data-go="1"><span class="kk r2">↵</span>开始营业<span class="t3">进入夜间</span></div>`;
  $('spdpop').classList.remove('show'); m.classList.add('show'); SFX.blip();
  m.querySelectorAll('.it').forEach(it => { it.onmouseenter = () => SFX.hover(); it.onclick = e => { e.stopPropagation(); m.classList.remove('show'); if (it.dataset.go) { SFX.click(); return goNight(); } const a = acts[+it.dataset.i], why = canAct(a); if (why) return deny(why); SFX.select(); bubble(true); a.run(); }; });
}
const HOTS = [
  { x: 14, y: 36, w: 138, h: 150, tip: '书架 · 预训练「百科」', act: 'pretrain', arg: 'knowledge' },
  { x: 192, y: 34, w: 148, h: 78, tip: '布告板 · 预训练「论坛」', act: 'pretrain', arg: 'colloquial' },
  { x: 192, y: 112, w: 148, h: 56, tip: '梗图 · 预训练「评论区」', act: 'pretrain', arg: 'open' },
  { x: 350, y: 128, w: 46, h: 110, tip: '衣钩 · 预训练「官网」', act: 'pretrain', arg: 'formal' },
  { x: 462, y: 310 + DESK_DY, w: 88, h: 80, tip: '笔记本 · 预训练「技术文档」', act: 'pretrain', arg: 'logic' },
  { x: 552, y: 350 + DESK_DY, w: 46, h: 40, tip: '书立 · 预训练「小说」', act: 'pretrain', arg: 'narrative' },
  { x: 222, y: 268 + DESK_DY, w: 154, h: 112, tip: '显示器 · 后训练', act: 'posttrain' },
  { x: 180, y: 360 + DESK_DY, w: 30, h: 32, tip: '马克杯 · 吃白饭', act: 'eat' },
];
export function initDay() {
  HOTS.forEach(h => {
    const d = document.createElement('div'); d.className = 'hot'; Object.assign(d.style, { left: h.x + 'px', top: h.y + 'px', width: h.w + 'px', height: h.h + 'px' });
    d.innerHTML = `<span class="tip r2">${h.tip}</span>`; d.onmouseenter = () => SFX.hover();
    d.onclick = e => {
      e.stopPropagation(); if (G.busy || G.mode !== 'day' || performance.now() - G.startT < 500) return;
      const a = enabled().find(x => x.id === h.act); if (!a) return deny('今天不开放'); const why = canAct(a); if (why) return deny(why);
      const p = sp(d); ring(p.x + p.w / 2, p.y + p.h / 2, P.cobalt, 18, 90); SFX.select(); bubble(true);
      if (h.act === 'pretrain') view('pre', h.arg); else a.run();
    };
    $('hots').appendChild(d);
  });
  $('fishhit').addEventListener('click', e => { e.stopPropagation(); if (G.busy || G.mode !== 'day') return; SFX.click(); const s = !$('bubble').classList.contains('show'); bubble(s); if (s) view('menu'); const p = sp($('fishhit')); ring(p.x + 65, p.y + 30, P.cobalt, 14, 70); setFish('pick'); if (!s) toast('她在发呆'); });
  on('composer', openMenu); on('t-act', openMenu);
  $('tokdev').addEventListener('click', () => { SFX.chunk(); DEV.kick = 1; DEV.flash = 1; DEV.glow = 1; toast(G.mode === 'day' ? '分词机：白天在读语料，晚上才吐 token' : `分词机：本轮已吐出 ${G.tok} 个 token`); });
}
