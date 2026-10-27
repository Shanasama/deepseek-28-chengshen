// 存档：都存在本机浏览器里（localStorage），按最终 28 天版本设计（v3 §7.3、美术规范 §6.9）。
//   槽位 0 = 自动存档（每天早上开工前写，只能读）；1–17 = 手动存档（只在白天能存）。
//   回档用的「今晚开始前」快照只放内存里，不进存档（夜里不能存档）。
//   成就跨局累计，单独存一份；音量和倍速也记在本机。
//   剧情编辑器的试玩（G.noSave）不读写这里的任何东西。
import { G } from './状态.js';
import { $, fmt } from './基础.js';
import { DATA } from './数据.js';
import { drawWindow } from './工位.js';

export const SLOTS = 18, AUTO = 0;
const FMT = 1;   // 存档格式版本：下面 KEYS 里存的东西改了就 +1，旧档会显示「旧版本存档」
const PRE = 'dafeiyu-';
const KEY = i => PRE + 'slot-' + i;
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
// 存档对得上这一版游戏吗：格式版本 + 日程表（版本、天数）。日程表改了，旧档就读不了
const sig = () => `${FMT}/${DATA.sched.version}/${DATA.sched.days.length}`;

// ---------- 整局状态 ↔ 可存的数据 ----------
const KEYS = ['day', 'hearts', 'heartMax', 'quota', 'quotaMax', 'tiboUsed', 'rollbacks', 'stage', 'adj', 'done', 'qSeen', 'qSeq', 'prev', 'used', 'total', 'history',
  'ap', 'apMax', 'post', 'postMax', 'clock', 'stats'];
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
export function stateOf() {
  const s = {}; KEYS.forEach(k => s[k] = clone(G[k]));
  s.eggSeen = [...G.eggSeen]; s.achievements = [...(G.achievements || [])];
  s.tonight = G.tonight.map(({ entry, ...v }) => clone(v));   // 剧本库条目读档时按文件夹重新找
  return s;
}
export function applyState(s) {
  KEYS.forEach(k => G[k] = clone(s[k]));
  G.eggSeen = new Set(s.eggSeen); G.achievements = new Set(s.achievements);
  G.tonight = s.tonight.map(v => ({ ...v, entry: DATA.list.find(e => e.dir === v.dir) })).filter(v => v.entry);
}

// ---------- 槽位 ----------
export function readSlot(i) { const s = ls.get(KEY(i)); if (s) s.ok = s.sig === sig(); return s; }
export function writeSlot(i) {
  const now = new Date(), s = {
    sig: sig(), t: now.getTime(), real: now.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    thumb: thumb(), info: { day: G.day, time: fmt(G.clock), hearts: G.hearts, quota: G.quota, quotaMax: G.quotaMax, ap: G.ap, apMax: G.apMax, tonight: G.tonight.map(v => v.name) },
    state: stateOf(),
  };
  return ls.set(KEY(i), s) ? s : null;
}
export const deleteSlot = i => ls.set(KEY(i), null);
export function autoSave() { if (!G.noSave) writeSlot(AUTO); }
// 最新的一份能读的档（「继续」用：自动档和手动档谁新读谁）
export function latest() {
  let best = null;
  for (let i = 0; i < SLOTS; i++) { const s = readSlot(i); if (s && s.ok && (!best || s.t > best.s.t)) best = { i, s }; }
  return best;
}
export const slotNo = i => i === AUTO ? 'AUTO' : String(i).padStart(2, '0');

// 缩略图：把工位的各图层按原位置缩小叠到一张图上
function thumb() {
  drawWindow(performance.now(), 0);   // 窗户平时隔几帧才画一次，刚换成白天时可能还是夜景
  const room = $('room'), c = document.createElement('canvas'), k = 296 / 600; c.width = 296; c.height = 240;
  const x = c.getContext('2d');
  for (const el of room.children) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || el.id === 'glow' || +cs.opacity === 0) continue;
    const L = el.offsetLeft * k, T = el.offsetTop * k, W = el.offsetWidth * k, H = el.offsetHeight * k; if (!W || !H) continue;
    if (el.tagName === 'CANVAS' || el.tagName === 'IMG') { try { x.drawImage(el, L, T, W, H); } catch { } }
    else if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') { x.fillStyle = cs.backgroundColor; x.fillRect(L, T, W, H); }
  }
  return c.toDataURL('image/jpeg', .82);
}

// ---------- 回档：今晚开始前的快照（只在内存里） ----------
let NIGHT = null;
export function snapNight() { NIGHT = stateOf(); }
export const nightSnap = () => NIGHT;
// 回到今晚开始前；回档次数按「用掉一次」算，不跟着快照回去
export function restoreNight() { if (!NIGHT) return false; const left = G.rollbacks - 1; applyState(NIGHT); G.rollbacks = left; return true; }

// ---------- 成就（跨局累计） ----------
const ACH = PRE + 'achievements';
export const achEver = () => new Set(ls.get(ACH) || []);
export function achRecord(id) { if (G.noSave) return; const s = achEver(); s.add(id); ls.set(ACH, [...s]); }

// ---------- 设置（音量、倍速） ----------
const SET = PRE + 'settings';
export function loadSettings() { const s = ls.get(SET); if (!s) return; ['vMusic', 'vSfx', 'spd'].forEach(k => { if (typeof s[k] === 'number') G[k] = s[k]; }); }
export function saveSettings() { ls.set(SET, { vMusic: G.vMusic, vSfx: G.vSfx, spd: G.spd }); }
