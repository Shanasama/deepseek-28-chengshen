// 标题画面：夜里的工位做背景（大肥鱼趴桌睡觉），菜单「继续 / 新游戏 / 读档 / 成就 / 设置」，鼠标和键盘都能选。
// 游戏里点标题栏的 × 回到这里（先确认）；整局结束后也回到这里。
import { G } from './状态.js';
import { $, P, pxIcon, ICON, restart, toast } from './基础.js';
import { ac, SFX } from './音频.js';
import { setFish } from './工位.js';
import { setMode, confirmBox, renderSettings } from './界面.js';
import { latest, readSlot, AUTO } from './存档.js';
import { openSL, slOpen } from './存读档.js';
import { renderBadges } from './报告.js';
import { newGame, loadSave, quitRun } from './日程.js';

const MENU = [
  { id: 'cont', n: '继续', sub: () => { const l = latest(); return l ? `Day ${l.s.info.day} · ${l.s.info.time} · ${l.i === AUTO ? '自动存档' : 'No.' + String(l.i).padStart(2, '0')}` : '还没有存档'; }, dis: () => !latest(), run: () => loadSave(latest().s) },
  { id: 'new', n: '新游戏', sub: () => '从第 1 天早上开始', run: async () => { if (readSlot(AUTO) && !(await confirmBox('开始新的一局？', '新的一局会覆盖自动存档，手动存档保留。', '开始'))) return; leave(); newGame(); } },
  { id: 'load', n: '读档', sub: () => '自动存档 + 17 个手动槽位', run: () => openSL('load', { onLoad: s => loadSave(s) }) },
  { id: 'ach', n: '成就', sub: () => '跨局累计', run: () => panel('tach') },
  { id: 'set', n: '设置', sub: () => '音乐、音效', run: () => panel('tset') },
];
let sel = 0;
export const titleOn = () => $('titlescr').classList.contains('on');

export function showTitle() {
  G.inTitle = true; G.started = false; G.musSlow = true;
  setMode('night'); setFish('sleep'); panel(null);
  const t = $('titlescr'); t.classList.add('on'); restart(t, 'in');
  sel = latest() ? 0 : 1; renderMenu();
}
function leave() { G.inTitle = false; G.musSlow = false; $('titlescr').classList.remove('on'); setFish('idle'); }
export { leave as leaveTitle };
function renderMenu() {
  const box = $('tmenu'); box.innerHTML = '';
  MENU.forEach((m, i) => {
    const d = document.createElement('div'), dis = m.dis && m.dis(); d.className = 'ti r4' + (i === sel ? ' on' : '') + (dis ? ' dis' : '');
    d.innerHTML = `<span class="arr">▶</span><b></b><span class="s t3"></span>`; d.querySelector('b').textContent = m.n; d.querySelector('.s').textContent = m.sub();
    d.onmouseenter = () => { if (sel !== i) { sel = i; renderMenu(); SFX.hover(); } };
    d.onclick = e => { e.stopPropagation(); first(); sel = i; activate(); };
    box.appendChild(d);
  });
}
function activate() {
  const m = MENU[sel], el = $('tmenu').children[sel];
  if (m.dis && m.dis()) { restart(el, 'shk'); SFX.bad(); return toast('还没有存档：先开一局新游戏'); }
  SFX.confirm(); restart(el, 'hit'); m.run();
}
// 浏览器要求先有一次点击 / 按键才能出声
function first() { ac(); }
function panel(id) {
  ['tach', 'tset'].forEach(p => $(p).classList.toggle('on', p === id));
  if (id === 'tach') renderBadges($('tbadges'), new Set());
  if (id === 'tset') renderSettings();
}
export function titleKey(e) {
  first();
  if (slOpen()) return false;
  if ($('tach').classList.contains('on') || $('tset').classList.contains('on')) { if (e.code === 'Escape' || e.code === 'Enter') { SFX.click(); panel(null); } return true; }
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { sel = (sel + MENU.length - 1) % MENU.length; SFX.hover(); renderMenu(); }
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') { sel = (sel + 1) % MENU.length; SFX.hover(); renderMenu(); }
  else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); activate(); }
  return true;
}
export function initTitle() {
  $('titlescr').addEventListener('pointerdown', first);
  document.querySelectorAll('#titlescr .pclose').forEach(b => b.onclick = () => { SFX.click(); panel(null); });
  $('tlogo2').appendChild(pxIcon(ICON.whale, { k: P.k0, B: P.cobalt, w: P.paper, I: P.ice }, 3));
}
// 标题画面的背景：把工位各图层放大画上去（窗外城市灯、显示器都还在动）
export function drawTitleBg() {
  const c = $('tbg'), x = c.getContext('2d'), room = $('room'), k = 1.15, ox = 270, oy = -20;   // 工位放在右边，左边留给标题和菜单
  x.imageSmoothingEnabled = false; x.fillStyle = P.k1; x.fillRect(0, 0, 960, 540);
  for (const el of room.children) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || el.id === 'glow') continue;
    const L = el.offsetLeft * k + ox, T = el.offsetTop * k + oy, W = el.offsetWidth * k, H = el.offsetHeight * k; if (!W || !H) continue;
    if (el.tagName === 'CANVAS' || el.tagName === 'IMG') { try { x.drawImage(el, L, T, W, H); } catch { } }
    else if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') { x.fillStyle = cs.backgroundColor; x.fillRect(L, T, W, H); }
  }
}
// 游戏里点 × ：先确认，再回到标题
export async function askBackToTitle() {
  if (G.noSave) return toast('试玩模式：关掉这个标签页就行');
  if (!G.started) return;
  if (G.busy && G.mode === 'day') return toast('等她忙完手上这件事');
  const night = G.mode === 'night';
  const ok = await confirmBox('回到标题？', night ? '现在退出，今晚的进度会丢。下次从今天早上的自动存档开始。' : '今天早上以后没存档的进度会丢。', '回到标题');
  if (!ok) return;
  await quitRun(); showTitle();
}
