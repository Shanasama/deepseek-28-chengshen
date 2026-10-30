// 入口：载入数据、装配界面、主循环、键盘。
import { G, QT, AXES } from './状态.js';
import { $, fit, updateStageRect, toast, AT, P, pxIcon } from './基础.js';
import { ac, musUpdate, SFX } from './音频.js';
import { drawParts } from './特效.js';
import { drawWindow, drawDust, drawScreen, drawDevice, drawRoomItems, whenFishReady, setFish } from './工位.js';
import { useSprite, showGuides } from './立绘.js';
import { drawLight } from './光影.js';
import { emitUpdate, flightsUpdate, refreshFishAvatars, chatTab } from './对话栏.js';
import { NODE, nodeTick, spin, confirmPick, regen } from './转盘.js';
import { radarTick } from './六维图.js';
import { initShell, drawer, renderAP, renderHUD, closeMenus, on, setMode } from './界面.js';
import { initDay, dayKeys, pickActByIndex, view, goNight, trialIdle, trialQuestion } from './白天.js';
import { newGame, skipCurrent, startTrial, startShowPreview, replayShow, loadSave, quitRun, endEarly } from './日程.js';
import { spotKey, storyOn, storyKey, ARROW } from './教学.js';
import { storyKeyDown, storyKeyUp } from './剧情.js';
import { setTab, reportNext, finalNext, renderSelf } from './报告.js';
import { loadSettings, latest, readSlot, tipsReset } from './存档.js';
import { initSL, openSL, slOpen, slKey } from './存读档.js';
import { initTitle, showTitle, titleOn, titleKey, drawTitleBg, askBackToTitle } from './标题.js';
import { DATA, loadAll } from './数据.js';
import { w } from './训练.js';

addEventListener('resize', fit); fit();
loadSettings(); initShell(); initDay(); initSL(); initTitle();
whenFishReady(refreshFishAvatars);
document.querySelectorAll('.ptab[data-tab]').forEach(t => t.addEventListener('click', () => { SFX.click(); setTab(t.dataset.tab); }));
document.querySelectorAll('#tabs span').forEach(t => t.addEventListener('click', () => { SFX.click(); chatTab(t.dataset.t); }));
// 存档 / 读档：只在白天能存；夜里给梗提示（v3 §7.3）。图标栏的存档图标直接打开存读档界面
const canSave = () => G.started && !G.noSave && G.mode === 'day' && !G.busy;
function openSave(mode) {
  if (G.noSave) return toast('试玩模式不存档');
  if (G.mode === 'night') return toast(mode === 'save' ? '服务中，无法存档。想回滚请用回档' : '服务中，无法读档。想回滚请用回档');
  if (G.busy) return toast('等她忙完手上这件事');
  drawer(false); closeMenus(); openSL(mode, { canSave: canSave(), onLoad: loadSave });
}
on('d-save', () => openSave('save')); on('d-load', () => openSave('load')); on('r-save', () => openSave('save'));
on('wb-x', () => askBackToTitle());
on('d-off', () => endEarly());
document.querySelectorAll('.tipreset').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); SFX.click(); tipsReset(); toast('新手提示会重新出现'); }));
document.querySelector('#spot .sarr').appendChild(pxIcon(ARROW, { k: P.ink, Y: P.lgold }, 2));

// ---------- 主循环 ----------
const fxc = $('fxc').getContext('2d'); let lastT = performance.now(), frame = 0;
function loop(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now; frame++; updateStageRect();
  G.timeScale += (G.tsTarget - G.timeScale) * Math.min(1, dt * (G.tsTarget < G.timeScale ? 7 : 4));
  emitUpdate(dt); flightsUpdate(dt); nodeTick(now, dt); musUpdate(); radarTick(dt);
  if (G.mode === 'night') { const breath = .12 + .08 * Math.sin(now / 1300); G.glow = Math.max(0, G.glow - dt * 5 * G.timeScale); $('glow').style.opacity = Math.min(.75, breath + G.glow * .55).toFixed(2); }
  if (frame % 3 === 0) drawWindow(now, dt * 3); if (frame % 2 === 0 && titleOn()) drawTitleBg(); drawDust(dt * G.timeScale, now); if (frame % 2 === 0) drawScreen(now); drawDevice(now, dt * Math.max(.15, G.timeScale)); drawLight(now, dt);
  drawParts(fxc, dt, now);
  if (frame % 20 === 0) devRender();
  requestAnimationFrame(loop);
}

// ---------- 开始 ----------
// 剧情编辑器打开时会带参数：?play=用户/场景.json（单场试玩）或 ?show=演出编号（只播一段共享演出）
const Q = new URLSearchParams(location.search), PLAY = Q.get('play'), SHOW = Q.get('show'), SPRV = Q.get('立绘预览'), TPRV = Q.get('后训练预览');
if (SPRV || TPRV) $('start').style.display = 'none';
else if (!PLAY && !SHOW) { $('start').style.display = 'none'; $('titlescr').classList.add('on'); }   // 载入时先只露出标题画面的底
if (location.protocol === 'dfy:') $('dev').style.display = 'none';   // 桌面版（封装/）不放开发面板
function trialArgs() {
  const i = PLAY.lastIndexOf('/'), stages = {};
  for (const kv of (Q.get('st') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); if (AXES.includes(k)) stages[k] = +v; }
  let adj = null; try { adj = Q.get('adj') ? JSON.parse(Q.get('adj')) : null; } catch { }
  return { dir: PLAY.slice(0, i), file: PLAY.slice(i + 1), stages: Q.get('st') ? stages : null, adj };
}
let ready = false;
// 正常打开游戏直接进标题画面；只有编辑器的试玩才用「点击开始」这张卡（浏览器要先点一下才能出声）
function start() {
  if (!ready || G.started || !(PLAY || SHOW)) return; G.startT = performance.now(); ac(); $('start').style.display = 'none';
  if (PLAY) { SFX.slow(); startTrial(trialArgs()); } else startShowPreview(SHOW);
}
$('start').onclick = start;
addEventListener('keydown', e => {
  if (storyOn()) return storyKey(e);
  if (spotKey(e)) return;
  if (slOpen()) return slKey(e);
  if ($('modal').classList.contains('on')) { if (e.code === 'Enter') $('myes').click(); if (e.code === 'Escape') $('mno').click(); return; }
  if ($('restore').classList.contains('on')) { if (e.code === 'Enter') $('ryes').click(); return; }
  if (storyKeyDown(e)) return;   // 游戏剧情正在播
  if (titleOn()) { titleKey(e); return; }
  if (!G.started) { if (e.code === 'Space') { e.preventDefault(); start(); } return; }
  if ($('final').classList.contains('on')) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); finalNext(); } return; }
  if ($('report').classList.contains('on')) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); reportNext(); } return; }
  if ($('endcard').classList.contains('on')) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); $('erestart').click(); } return; }
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

addEventListener('keyup', storyKeyUp);

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
window.__dfy = { G, NODE, spin, confirmPick, regen, goNight, reportNext, finalNext, skipCurrent, DATA, loadSave, latest, readSlot, showTitle, quitRun };

// 编辑器「工位动画」检查页把游戏放在 iframe 里（?立绘预览=day|night）：不进标题，直接摆出工位；
// 检查页用 postMessage 送来帧、要播的动作、白天 / 夜里、参考线开关
function spritePreview() {
  G.noSave = true; $('dev').style.display = 'none'; let cur = 'idle';
  setMode(SPRV === 'night' ? 'night' : 'day'); setFish(cur);
  addEventListener('message', e => {
    if (e.origin !== location.origin) return; const m = e.data || {};
    if (m.type === '立绘') {
      const acts = {}; for (const [k, fs] of Object.entries(m.acts || {})) acts[k] = fs.map(f => { const c = document.createElement('canvas'); c.width = f.bmp.width; c.height = f.bmp.height; c.getContext('2d').drawImage(f.bmp, 0, 0); return { c, ms: f.ms }; });
      useSprite(acts); setFish(cur); refreshFishAvatars();
    }
    if (m.type === '动作') { cur = m.act; setFish(cur); }
    if (m.type === '模式') { setMode(m.mode); setFish(cur); }
    if (m.type === '参考线') showGuides(!!m.on);
  });
  parent.postMessage({ type: '立绘就绪' }, location.origin);
}

// 编辑器「后训练」模块把游戏放在 iframe 里（?后训练预览=1）：白天的工位，气泡里做编辑器送来的那道题。
// 消息：试做 {q 题目, pair [属性, 属性], stages 预训练阶段（可省，默认全浅层）}；不存档，每次试做都从同一个盘面开始
function trainPreview() {
  G.noSave = true; $('dev').style.display = 'none'; setMode('day'); setFish('idle');
  const base = Object.fromEntries(AXES.map(a => [a, 1]));
  addEventListener('message', e => {
    if (e.origin !== location.origin) return; const m = e.data || {};
    if (m.type !== '试做' || G.busy) return;
    Object.assign(G.stage, base, m.stages || {}); G.adj = Object.fromEntries(QT.map(t => [t, {}])); G.quota = 10;
    trialQuestion(m.q, m.pair);
  });
  trialIdle(); parent.postMessage({ type: '后训练就绪' }, location.origin);
}

// ---------- 载入 ----------
(async () => {
  try {
    await loadAll(); ready = true;
    const n = DATA.list.filter(e => !e.user.boss && !e.user.tutorial).reduce((s, e) => s + e.scenes.length, 0);
    $('startinfo').textContent = PLAY ? `单场试玩：${PLAY.replace('/', ' / ')} · 训练状态来自剧情编辑器` : `共享演出预览：${SHOW}`;
    $('startinfo2').textContent = `dafeiyu-v3 · 剧本库 ${DATA.list.length} 个用户、${n} 个普通场景 · 存档在本机`;
    if (SPRV) spritePreview();
    else if (TPRV) trainPreview();
    else if (!PLAY && !SHOW) { $('start').style.display = 'none'; showTitle(); }
  } catch (e) { console.error(e); $('startinfo').textContent = '读不到剧本库：' + e.message + '（请用 node 剧情编辑器/serve.js 打开）'; }
})();
requestAnimationFrame(loop);
