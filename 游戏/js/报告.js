// 模型评测报告：预览窗的「自我认知」标签页（随时可看），每晚结算时以弹窗完整展示（美术规范 §12）。
import { G, QT, AXES } from './状态.js';
import { P, AT, $, fmt, restart } from './基础.js';
import { SFX } from './音频.js';
import { confetti } from './特效.js';
import { w } from './训练.js';
import { mkRadar, dropRadar, radarLabels } from './六维图.js';
import { setUrl, HOME } from './界面.js';

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
    const lbl = { solved: ['解决离开', 'b-ok'], win: ['特殊胜利', 'b-ok'], offline: ['下线', 'b-bad'], forced: ['强制下线', 'b-bad'], drop: ['掉线', 'b-egg'] };
    $('rsess').innerHTML = G.sessions.map(s => { const [n, c] = lbl[s.result] || ['—', 'b-ph']; return `<div class="r2"><span></span><span class="sp"></span><span class="badge r2 ${c}">${n}</span></div>`; }).join('');
    [...$('rsess').children].forEach((d, i) => { d.firstChild.textContent = G.sessions[i].visitor.name + (G.sessions[i].visitor.repeat ? '（重复来访）' : ''); setTimeout(() => { d.classList.add('in'); SFX.step(i); }, 300 + i * 120); });
    renderStats($('rstats'), G.stats);
    $('rnote').textContent = trial ? '单场试玩 · 训练状态来自剧情编辑器' : last ? 'Demo 的三天到这里就结束了' : `明天白天还有 ${G.apMax} 个行动点`;
    $('rnext').innerHTML = (trial ? '再玩一次' : last ? '查看 3 天总结' : `进入第 ${G.day + 1} 天`) + ' <span class="key r2">Enter</span>';
    r.classList.add('on'); SFX.confirm(); setTimeout(() => confetti(480, 140, 40), 400);
    onNext = () => { onNext = null; r.classList.remove('on'); dropRadar(RR); SFX.click(); ok(); };
    $('rnext').onclick = onNext;
  });
}
export const reportNext = () => onNext && onNext();

// ---------- 整局结束 ----------
let onRestart = null;
export function showEnd(kind, restartFn) {
  const tot = G.total;
  $('eh').textContent = kind === 'hearts' ? `大肥鱼 已下线维护 · 第 ${G.day} 天，心尽` : '大肥鱼 HARNESS · Demo 3 天总结';
  $('et').textContent = kind === 'hearts' ? '心归零，整局结算（回档第 4 步接入）。' : `三天服务了 ${tot.solved + tot.lost} 位以上用户。成就：${G.achievements ? [...G.achievements].length : 0} 个。`;
  $('estats').innerHTML = [['解决离开', tot.solved, P.mint], ['点赞', tot.like, P.mint], ['点踩', tot.dislike, P.red], ['用户流失', tot.lost, P.t1], ['蒙混过关', tot.bluff, P.lgold], ['被识破', tot.caught, P.t1], ['彩蛋', tot.eggs, P.lpurple], ['剩余心', G.hearts, P.rose]]
    .map(([n, v, c]) => `<div class="r4"><b style="color:${c}">${v}</b><span class="t3">${n}</span></div>`).join('');
  $('endcard').classList.add('on'); SFX[kind === 'hearts' ? 'bad' : 'good']();
  onRestart = restartFn; $('erestart').onclick = () => { $('endcard').classList.remove('on'); SFX.click(); onRestart && onRestart(); };
}
