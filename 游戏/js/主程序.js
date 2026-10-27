// 入口：载入数据、装配界面、主循环、键盘。
import { G, QT, AXES } from './状态.js';
import { $, fit, updateStageRect, toast, AT } from './基础.js';
import { ac, musUpdate, SFX } from './音频.js';
import { drawParts } from './特效.js';
import { drawWindow, drawDust, drawScreen, drawDevice, drawRoomItems, whenFishReady } from './工位.js';
import { emitUpdate, flightsUpdate, refreshFishAvatars, chatTab } from './对话栏.js';
import { NODE, nodeTick, spin, confirmPick, regen } from './转盘.js';
import { radarTick } from './六维图.js';
import { initShell, drawer, renderAP, renderHUD, closeMenus } from './界面.js';
import { initDay, dayKeys, pickActByIndex, view, goNight } from './白天.js';
import { newGame, skipCurrent, startTrial, startShowPreview, replayShow } from './日程.js';
import { setTab, reportNext, renderSelf } from './报告.js';
import { DATA, loadAll } from './数据.js';
import { w } from './训练.js';

addEventListener('resize', fit); fit();
initShell(); initDay();
whenFishReady(refreshFishAvatars);
document.querySelectorAll('.ptab[data-tab]').forEach(t => t.addEventListener('click', () => { SFX.click(); setTab(t.dataset.tab); }));
document.querySelectorAll('#tabs span').forEach(t => t.addEventListener('click', () => { SFX.click(); chatTab(t.dataset.t); }));

// ---------- 主循环 ----------
const fxc = $('fxc').getContext('2d'); let lastT = performance.now(), frame = 0;
function loop(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now; frame++; updateStageRect();
  G.timeScale += (G.tsTarget - G.timeScale) * Math.min(1, dt * (G.tsTarget < G.timeScale ? 7 : 4));
  emitUpdate(dt); flightsUpdate(dt); nodeTick(now, dt); musUpdate(); radarTick(dt);
  if (G.mode === 'night') { const breath = .12 + .08 * Math.sin(now / 1300); G.glow = Math.max(0, G.glow - dt * 5 * G.timeScale); $('glow').style.opacity = Math.min(.75, breath + G.glow * .55).toFixed(2); }
  if (frame % 3 === 0) drawWindow(now, dt * 3); drawDust(dt * G.timeScale, now); if (frame % 2 === 0) drawScreen(now); drawDevice(now, dt * Math.max(.15, G.timeScale));
  drawParts(fxc, dt, now);
  if (frame % 20 === 0) devRender();
  requestAnimationFrame(loop);
}

// ---------- 开始 ----------
// 剧情编辑器打开时会带参数：?play=用户/场景.json（单场试玩）或 ?show=演出编号（只播一段共享演出）
const Q = new URLSearchParams(location.search), PLAY = Q.get('play'), SHOW = Q.get('show');
function trialArgs() {
  const i = PLAY.lastIndexOf('/'), stages = {};
  for (const kv of (Q.get('st') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); if (AXES.includes(k)) stages[k] = +v; }
  let adj = null; try { adj = Q.get('adj') ? JSON.parse(Q.get('adj')) : null; } catch { }
  return { dir: PLAY.slice(0, i), file: PLAY.slice(i + 1), stages: Q.get('st') ? stages : null, adj };
}
let ready = false;
function start() {
  if (!ready || G.started) return; G.started = true; G.startT = performance.now(); ac(); $('start').style.display = 'none';
  if (PLAY) { SFX.slow(); startTrial(trialArgs()); } else if (SHOW) startShowPreview(SHOW); else { SFX.morning(); newGame(); }
}
$('start').onclick = start;
addEventListener('keydown', e => {
  if (!G.started) { if (e.code === 'Space') { e.preventDefault(); start(); } return; }
  if ($('modal').classList.contains('on')) { if (e.code === 'Enter') $('myes').click(); if (e.code === 'Escape') $('mno').click(); return; }
  if ($('report').classList.contains('on')) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); reportNext(); } return; }
  if ($('endcard').classList.contains('on')) return;
  if (e.code === 'Escape' && $('drawer').classList.contains('on')) return drawer(false);
  if (e.code === 'Escape' && $('phone').classList.contains('show')) return $('phone-x').click();
  if (G.mode === 'night') {
    if (e.code === 'Enter' && SHOW) replayShow();
    else if (e.code === 'Space') { e.preventDefault(); if (NODE.state === 'ready') spin(); else if (NODE.state === 'stopped') confirmPick(); }
    else if (e.code === 'KeyR') regen();
    return;
  }
  const { KEYQ, KEYR, KEYSUM } = dayKeys();
  if (KEYQ) { if (e.code === 'ArrowLeft' || e.code === 'KeyA') KEYQ(0); else if (e.code === 'ArrowRight' || e.code === 'KeyB') KEYQ(1); else if (e.code === 'KeyR') KEYR && KEYR(); return; }
  if (KEYSUM) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); KEYSUM(); } return; }
  if (G.busy) return;
  if (G.view === 'menu' && /^Digit[1-9]$/.test(e.code)) pickActByIndex(+e.code.slice(5) - 1);
  else if (e.code === 'Escape' && G.view !== 'menu') { SFX.click(); view('menu'); }
  else if (e.code === 'Enter') goNight();
});

// ---------- 开发面板（不属于设计） ----------
$('devh').onclick = () => $('dev').classList.toggle('min');
$('d-ap').onclick = () => { G.ap = G.apMax; G.post = 0; renderAP(); if (G.mode === 'day' && !G.busy) view('menu'); };
$('d-h5').onclick = () => { G.hearts = 5; renderHUD(); };
$('d-q3').onclick = () => { G.quota = 3; renderHUD(); };
$('d-skip').onclick = () => skipCurrent();
const setStages = v => { AXES.forEach(a => G.stage[a] = v); drawRoomItems(); renderSelf(); if (G.mode === 'day' && !G.busy) view('menu'); };
$('d-s1').onclick = () => setStages(1); $('d-s2').onclick = () => setStages(2);
function devRender() {
  if ($('dev').classList.contains('min')) return;
  const s = G.sessions[G.cur];
  $('devstate').textContent = `Day ${G.day} · ${G.mode} · 行动点 ${G.ap}/${G.apMax} · 心 ${G.hearts} · 额度 ${G.quota}\n` +
    (s ? `会话 ${G.cur + 1}/${G.sessions.length}：${s.visitor.name} · ${s.file}\n耐心 ${G.patience} · 推进 ${G.prog}/${s.U.N} · 重问 ${G.retry} · 节点 ${NODE.state}` : `今晚：${G.tonight.map(v => v.name + (v.repeat ? '(重复)' : '')).join('、')}`) +
    `\n题库：${DATA.bankFake ? '假题（正式题库还没写）' : '正式题库'}`;
  $('devtab').innerHTML = '<tr><td></td>' + QT.map(t => `<td>${t.slice(0, 2)}</td>`).join('') + '</tr>' + AXES.map(a => `<tr><td><span style="color:${AT[a].c}">■</span> ${AT[a].s}${G.stage[a] === 2 ? '·深' : ''}</td>` + QT.map(t => { const v = w(t, a); return `<td>${v == null ? '—' : v.toFixed(2)}</td>`; }).join('') + '</tr>').join('');
}

// 调试用：控制台里能拿到状态和几个操作（自动试玩脚本用）
window.__dfy = { G, NODE, spin, confirmPick, regen, goNight, reportNext, skipCurrent, DATA };

// ---------- 载入 ----------
(async () => {
  try {
    await loadAll(); ready = true;
    const n = DATA.list.filter(e => !e.user.boss && !e.user.tutorial).reduce((s, e) => s + e.scenes.length, 0);
    $('startinfo').textContent = PLAY ? `单场试玩：${PLAY.replace('/', ' / ')} · 训练状态来自剧情编辑器` : SHOW ? `共享演出预览：${SHOW}` : `剧本库：${DATA.list.length} 个用户、${n} 个普通场景 · 有音效和音乐`;
  } catch (e) { console.error(e); $('startinfo').textContent = '读不到剧本库：' + e.message + '（请用 node 剧情编辑器/serve.js 打开）'; }
})();
requestAnimationFrame(loop);
