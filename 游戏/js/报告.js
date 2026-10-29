// 模型评测报告：预览窗的「自我认知」标签页（随时可看），每晚结算时以弹窗完整展示（美术规范 §12）。
import { G, QT, AXES } from './状态.js';
import { P, AT, $, fmt, restart, pxIcon, ICON } from './基础.js';
import { SFX } from './音频.js';
import { confetti } from './特效.js';
import { w } from './训练.js';
import { mkRadar, dropRadar, radarLabels } from './六维图.js';
import { setUrl, HOME } from './界面.js';
import { DATA, regName } from './数据.js';

function tabs(box, cur, onPick) {
  box.innerHTML = ''; QT.forEach(t => { const s = document.createElement('span'); s.className = 'r2' + (t === cur ? ' on' : ''); s.textContent = t + '类'; s.onclick = () => { SFX.click(); onPick(t); }; box.appendChild(s); });
}
function attrRows(box, t) {
  box.innerHTML = '';
  AXES.forEach(a => {
    const s = w(t, a), lv = G.stage[a], r = document.createElement('div'); r.className = 'arow r4' + (s == null ? ' locked' : '');
    const bd = a === 'open' && lv === 0 ? ['0 级', ''] : [['未解锁', ''], ['浅层', 's1'], ['深层', 's2']][lv];
    r.innerHTML = `<div class="l"><i class="chipc" style="background:${AT[a].c}"></i>${AT[a].n}<span class="badge r2 ${bd[1]}">${bd[0]}</span><span class="sc">${s == null ? '—' : s.toFixed(2)}</span></div><div class="bar"><i style="width:${s == null ? 0 : Math.min(100, s / 4 * 100)}%;background:${AT[a].c}"></i></div>`;
    box.appendChild(r);
  });
}
const statCells = st => [['点赞', st.like, P.mint], ['点踩', st.dislike, P.red], ['用户流失', st.lost, 'var(--tx1)'], ['蒙混过关', st.bluff, P.lgold], ['被识破', st.caught, 'var(--tx1)'], ['剩余心', G.hearts, P.rose], ['控盘额度', G.quota + '/' + G.quotaMax, P.sky], ['回档', G.rollbacks > 0 ? `剩 ${G.rollbacks}` : '已用', 'var(--tx2)']];
const renderStats = (box, st) => { box.innerHTML = statCells(st).map(([n, v, c]) => `<div class="r4"><b style="color:${c}">${v}</b><span class="t3">${n}</span></div>`).join(''); };

// ---------- 自我认知标签页 ----------
let SR = null;
export function renderSelf() {
  $('selfsub').textContent = `Day ${G.day} · ${G.mode === 'day' ? '白天' : '夜间'} · dafeiyu-v3 · 实时 · ${fmt(G.clock)}`;
  tabs($('stabs'), G.selfType, t => { G.selfType = t; renderSelf(); });
  dropRadar(SR); SR = mkRadar($('radar'), 220, G.selfType); radarLabels($('radarbox'), SR, 15, 15);
  attrRows($('attrs'), G.selfType); renderStats($('stats'), G.stats);
}
export function setTab(t) {
  G.tab = t; $('pane').classList.toggle('self', t === 'self'); document.querySelectorAll('.ptab[data-tab]').forEach(e => e.classList.toggle('on', e.dataset.tab === t));
  if (t === 'self') { setUrl('dafeiyu://<b>self</b>/model-card', true); renderSelf(); } else setUrl(HOME(), true);
}

// ---------- 每晚结算 ----------
let RR = null, onNext = null;
export function showReport(last, trial = false) {
  return new Promise(ok => {
    const r = $('report'); $('rstamp').textContent = 'NIGHT ' + G.day;
    $('rsub').textContent = `Day ${G.day} · 夜间结束 · dafeiyu-v3`;
    let t = G.reportType || '知识';
    const draw = () => { tabs($('rtabs'), t, x => { t = x; G.reportType = x; draw(); }); dropRadar(RR); RR = mkRadar($('rradar'), 220, t); RR.dark = true; radarLabels($('rradarbox'), RR, 15, 15); };
    draw();
    const lbl = { solved: ['解决离开', 'b-ok'], win: ['特殊胜利', 'b-ok'], offline: ['下线', 'b-bad'], forced: ['强制下线', 'b-bad'], drop: ['掉线', 'b-egg'], early: ['提前下班', 'b-early'] };
    $('rsess').innerHTML = G.sessions.map(s => { const [n, c] = lbl[s.result] || ['—', 'b-ph']; return `<div class="r2"><span></span><span class="sp"></span><span class="badge r2 ${c}">${n}</span></div>`; }).join('');
    [...$('rsess').children].forEach((d, i) => { d.firstChild.textContent = G.sessions[i].visitor.name + (G.sessions[i].visitor.repeat ? '（重复来访）' : ''); setTimeout(() => { d.classList.add('in'); SFX.step(i); }, 300 + i * 120); });
    renderStats($('rstats'), G.stats);
    $('rnote').textContent = trial ? '单场试玩 · 训练状态来自剧情编辑器' : last ? `一共 ${G.day} 天，到这里就结束了` : `明天白天还有 ${G.apMax} 个行动点`;
    $('rnext').innerHTML = (trial ? '再玩一次' : last ? `查看 ${G.day} 天总结` : `进入第 ${G.day + 1} 天`) + ' <span class="key r2">Enter</span>';
    r.classList.add('on'); SFX.confirm(); setTimeout(() => confetti(480, 140, 40), 400);
    onNext = () => { onNext = null; r.classList.remove('on'); dropRadar(RR); SFX.click(); ok(); };
    $('rnext').onclick = onNext;
  });
}
export const reportNext = () => onNext && onNext();

// ---------- 心尽：服务下线公告（美术规范 §10.6），点继续进最终评测 ----------
let onRestart = null;
export function showEnd(kind, restartFn) {
  const tot = G.total;
  $('eh').textContent = `大肥鱼 已下线维护 · 第 ${G.day} 天，心尽`;
  $('et').textContent = G.rollbacks > 0 ? '心归零。这次没有回档，整局结算。' : '心归零，回档也用完了，整局结算。';
  $('estats').innerHTML = [['解决离开', tot.solved, P.mint], ['点赞', tot.like, P.mint], ['点踩', tot.dislike, P.red], ['用户流失', tot.lost, P.t1], ['蒙混过关', tot.bluff, P.lgold], ['被识破', tot.caught, P.t1], ['彩蛋', tot.eggs, P.lpurple], ['剩余心', G.hearts, P.rose]]
    .map(([n, v, c]) => `<div class="r4"><b style="color:${c}">${v}</b><span class="t3">${n}</span></div>`).join('');
  $('endcard').classList.add('on'); SFX[kind === 'hearts' ? 'bad' : 'good']();
  onRestart = restartFn; $('erestart').onclick = () => { $('endcard').classList.remove('on'); SFX.click(); onRestart && onRestart(); };
}

// ---------- 徽章墙：成就跟着存档走，只看这一个存档拿到的。拿到的亮、没拿到的是剪影；
// fresh = 最终评测（这一局刚打完：拿到的标 NEW、一个个响），否则是标题画面看「继续」那个存档 ----------
export function renderBadges(box, have, fresh = false) {
  box.innerHTML = '';
  (DATA.reg.achievements || []).forEach((a, i) => {
    const st = have.has(a.id) ? (fresh ? 'new' : 'got') : 'lock', lock = st === 'lock';
    const d = document.createElement('div'); d.className = 'bdg r4 ' + st;
    d.appendChild(pxIcon(ICON.trophy, { k: lock ? P.k5 : P.ink, Y: lock ? P.k4 : P.gold, w: lock ? P.k5 : P.paper }, 3));
    d.insertAdjacentHTML('beforeend', '<span class="bn"></span><span class="bh"></span>' + (st === 'new' ? '<span class="nw r2">NEW</span>' : ''));
    d.querySelector('.bn').textContent = lock ? '？？？' : a.name;
    d.querySelector('.bh').textContent = lock ? (a.hint || '某位用户的某个回答里藏着') : st === 'new' ? '这一局解锁' : '这个存档里解锁了';
    d.title = d.querySelector('.bh').textContent;   // 最终评测里说明藏起来了，悬停看
    box.appendChild(d); setTimeout(() => { d.classList.add('in'); if (st === 'new') SFX.unlock(); }, 250 + i * 140);
  });
}

// ---------- 最终评测：打满全部天数 / 心尽，共用一页（v3 §2 收尾） ----------
let FR = null, onFinal = null;
export function showFinal(kind) {
  return new Promise(ok => {
    // kind：demo 打满天数 / hearts 心尽 / 其余是剧情触发的结局（成就编号，名字在登记表）
    const out = kind === 'hearts', story = !out && kind !== 'demo', tot = G.total;
    $('fh').textContent = story ? `结局：${regName('achievements', kind)}` : out ? `第 ${G.day} 天下线 · 最终评测` : `大肥鱼 · ${G.day} 天总结`;
    $('fstamp').textContent = story ? 'THE END' : out ? 'OFFLINE' : 'FINAL';
    $('fsub').textContent = `${G.day > 1 ? 'Day 1–' + G.day : 'Day 1'} · dafeiyu-v3 · 最终评测`;
    let t = G.reportType || '知识';
    const draw = () => { tabs($('ftabs'), t, x => { t = x; G.reportType = x; draw(); }); dropRadar(FR); FR = mkRadar($('fradar'), 200, t); FR.dark = true; radarLabels($('fradarbox'), FR, 15, 15); };
    draw();
    $('fdays').innerHTML = G.history.map(h => `<div class="r2"><b>Day ${h.day}</b><span>解决 ${h.solved}</span><span>流失 ${h.lost}</span><span>点赞 ${h.like}</span><span>彩蛋 ${h.eggs}</span>${h.out ? '<span style="color:var(--rose)">心尽</span>' : ''}</div>`).join('');
    [...$('fdays').children].forEach((d, i) => setTimeout(() => { d.classList.add('in'); SFX.step(i); }, 300 + i * 120));
    $('fstats').innerHTML = [['解决离开', tot.solved, P.mint], ['点赞', tot.like, P.mint], ['点踩', tot.dislike, P.red], ['用户流失', tot.lost, 'var(--t1)'], ['蒙混过关', tot.bluff, P.lgold], ['被识破', tot.caught, 'var(--t1)'], ['彩蛋', tot.eggs, P.lpurple], ['剩余心', G.hearts, P.rose]]
      .map(([n, v, c]) => `<div class="r4"><b style="color:${c}">${v}</b><span class="t3">${n}</span></div>`).join('');
    renderBadges($('fbadges'), G.achievements || new Set(), true);
    $('final').classList.add('on'); SFX[out ? 'confirm' : 'levelup'](); if (!out) setTimeout(() => confetti(480, 120, 60), 400);
    onFinal = () => { onFinal = null; $('final').classList.remove('on'); dropRadar(FR); FR = null; SFX.click(); ok(); };
    $('fnext').onclick = onFinal;
  });
}
export const finalNext = () => onFinal && onFinal();
