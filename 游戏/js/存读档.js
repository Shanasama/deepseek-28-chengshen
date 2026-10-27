// 存读档界面（日系 ACT / galgame 式，美术规范 §6.9）：3 页 × 6 格，第 1 格是自动存档（只能读），其余手动。
// 存档只在白天能存；从标题画面打开时只能读。读档真正怎么恢复交给 onLoad（日程.js 里装配）。
import { G } from './状态.js';
import { $, P, wait, restart, pxIcon, ICON, toast, mod } from './基础.js';
import { SFX } from './音频.js';
import { SLOTS, AUTO, readSlot, writeSlot, deleteSlot, slotNo } from './存档.js';

const PAGES = SLOTS / 6;
const SL = { mode: 'save', page: 0, pending: null, canSave: false, onLoad: null };
export const slOpen = () => $('sl').classList.contains('on');

// mode：'save' / 'load'；canSave：现在能不能存（白天、游戏进行中）；onLoad(存档) 读档时调用
export function openSL(mode, { canSave = false, onLoad } = {}) {
  Object.assign(SL, { mode: canSave ? mode : 'load', canSave, onLoad });
  const el = $('sl'); el.classList.remove('out'); el.classList.add('on'); renderSL(true); SFX.launch();
}
export function closeSL() {
  const el = $('sl'); el.classList.add('out'); $('slconfirm').classList.remove('on');
  setTimeout(() => el.classList.remove('on', 'out'), 240); SFX.click();
}
function renderSL(stagger) {
  document.querySelectorAll('#sl .mode span').forEach(s => { s.classList.toggle('on', s.dataset.m === SL.mode); s.classList.toggle('dis', s.dataset.m === 'save' && !SL.canSave); });
  $('sl').classList.toggle('load', SL.mode === 'load');
  $('slsub').textContent = SL.mode === 'save' ? '存档 · 选择一个槽位保存当前进度' : '读档 · 选择一个存档继续';
  const pg = $('slpages'); pg.innerHTML = '';
  for (let p = 0; p < PAGES; p++) { const s = document.createElement('span'); s.className = 'r2' + (p === SL.page ? ' on' : ''); s.textContent = p + 1; s.onclick = () => { SFX.click(); SL.page = p; renderSL(true); }; pg.appendChild(s); }
  const lb = document.createElement('span'); lb.className = 'lbl'; lb.textContent = SL.page === 0 ? '第 1 格是自动存档：每天早上开工前写入，只能读' : `第 ${SL.page + 1} 页`; pg.appendChild(lb);
  const g = $('slgrid'); g.innerHTML = '';
  for (let k = 0; k < 6; k++) {
    const i = SL.page * 6 + k, s = readSlot(i), no = slotNo(i), d = document.createElement('div'), auto = i === AUTO;
    d.className = 'scard r4 ' + (s ? (s.ok ? 'has' : 'has old') : 'empty');
    const tag = auto ? '<span class="tag r2">AUTO</span>' : '', fx = '<div class="flash"></div><div class="stamp r2">SAVED</div>';
    if (s && s.ok) {
      const f = s.info;
      d.innerHTML = `<div class="sthumb r2"><img src="${s.thumb}"></div><div class="inf"><div class="no">No.${no}</div><div class="tt">Day ${f.day} · 白天 · ${f.time}</div>
        <div class="chips"><span class="r2">❤ ${f.hearts}</span><span class="r2">额度 ${f.quota}/${f.quotaMax}</span><span class="r2">行动点 ${f.ap}/${f.apMax}</span></div><div class="t2 who"></div><div class="dt">${s.real}</div></div>${tag}${fx}`;
      d.querySelector('.who').textContent = f.tonight.length ? '今晚：' + f.tonight.join('、') : '';
    } else if (s) d.innerHTML = `<div class="sthumb r2">OLD</div><div class="inf"><div class="no">No.${no}</div><div class="tt">旧版本存档</div><div class="t3">游戏更新过，这份读不了</div><div class="dt">${s.real || ''}</div></div>${tag}${fx}`;
    else d.innerHTML = `<div class="sthumb r2">NO DATA</div><div class="inf"><div class="no">No.${no}</div><div>${auto ? '— 还没有自动存档 —' : '— 空 —'}</div></div>${tag}${fx}`;
    d.onmouseenter = () => SFX.blip();
    d.onclick = () => slClick(i, d);
    d.oncontextmenu = e => { e.preventDefault(); if (!s || auto) return; slConfirm(`删除 No.${no} 吗？`, () => { deleteSlot(i); SFX.erase(); renderSL(); toast(`已删除 No.${no}`); }); };
    g.appendChild(d); setTimeout(() => d.classList.add('in'), stagger ? 40 + k * 45 : 0);
  }
}
function slClick(i, d) {
  SFX.click(); const s = readSlot(i), no = slotNo(i);
  if (SL.mode === 'save') {
    if (i === AUTO) { restart(d, 'shk'); SFX.bad(); return toast('自动存档只能读'); }
    const doSave = () => {
      if (!writeSlot(i)) return toast('浏览器不允许本地存储，存不了');
      renderSL(); const c = $('slgrid').children[i % 6]; c.classList.add('in');
      restart(c.querySelector('.flash'), 'on'); restart(c.querySelector('.stamp'), 'on'); SFX.good(); SFX.confirm();
    };
    s ? slConfirm(`覆盖 No.${no} 吗？`, doSave) : doSave();
  } else {
    if (!s) { restart(d, 'shk'); SFX.bad(); return toast('这个槽位是空的'); }
    if (!s.ok) { restart(d, 'shk'); SFX.bad(); return toast('旧版本存档，读不了'); }
    slConfirm(`读取 No.${no} 吗？当前进度会被覆盖。`, async () => {
      restart(d.querySelector('.flash'), 'on'); SFX.confirm(); await wait(250);
      $('slloading').classList.add('on'); await wait(900);
      $('slloading').classList.remove('on'); $('sl').classList.remove('on'); $('slconfirm').classList.remove('on');
      SL.onLoad && SL.onLoad(s); toast(`已读取 No.${no}`);
    });
  }
}
function slConfirm(q, fn) { $('slq').textContent = q; $('slconfirm').classList.add('on'); SL.pending = fn; SFX.note(); }
export function initSL() {
  $('slyes').onclick = () => { SFX.click(); $('slconfirm').classList.remove('on'); const f = SL.pending; SL.pending = null; f && f(); };
  $('slno').onclick = () => { SFX.click(); $('slconfirm').classList.remove('on'); SL.pending = null; };
  $('slback').onclick = () => closeSL();
  document.querySelectorAll('#sl .mode span').forEach(s => s.onclick = () => {
    if (s.dataset.m === 'save' && !SL.canSave) { restart(s, 'shk'); SFX.bad(); return toast(G.started && G.mode === 'night' ? '服务中，无法存档。想回滚请用回档' : '现在没有可存的进度'); }
    SFX.click(); SL.mode = s.dataset.m; renderSL(true);
  });
  $('slwhale').appendChild(pxIcon(ICON.whale, { k: P.k0, B: P.cobalt, w: P.paper, I: P.ice }, 4));
}
export function slKey(e) {
  const cf = $('slconfirm').classList.contains('on');
  if (e.code === 'Escape') cf ? $('slno').click() : closeSL();
  else if (cf && (e.code === 'Enter' || e.code === 'KeyY')) $('slyes').click();
  else if (cf && e.code === 'KeyN') $('slno').click();
  else if (!cf && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { SL.page = mod(SL.page + (e.code === 'ArrowLeft' ? -1 : 1), PAGES); SFX.click(); renderSL(true); }
  e.preventDefault();
}
