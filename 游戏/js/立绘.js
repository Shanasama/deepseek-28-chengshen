// 工位立绘：读合伙人交的逐帧动画，按动作播（规则和读法在 立绘读取.js，和编辑器检查页共用；对接说明：工位立绘接口.md）。
// 两种交法都认：Aseprite 导出的「大肥鱼.png + 大肥鱼.json」（tag = 动作名），或「动作名/01.png…」+「时长.txt」。
// 一张都没有时 SPRITE.ok = false，工位继续用参考图占位（工位.js 的 fishImg）。
// 测试别的素材：网址后面加 ?立绘=/游戏/素材/大肥鱼/样稿/；编辑器检查页用 useSprite 直接把帧塞进来。
import { $, DESK_Y } from './基础.js';
import { ONCE, HOLD, AVA, parseAseprite, asepriteImage, parseFolder, checkSprite, drawTemplate } from './立绘读取.js';
export { HOLD };

export const SPRITE = { ok: false, size: 120, scale: 2, desk: 110, acts: {}, from: '', warn: [] };
const DIR = new URLSearchParams(location.search).get('立绘') || '/游戏/素材/大肥鱼/';

const img = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
const get = async (u, text) => { try { const r = await fetch(u + '?t=' + Date.now()); return r.ok ? (text ? r.text() : r.json()) : null; } catch { return null; } };

export async function loadSprite(dir = DIR) {
  let got = null; const j = await get(dir + '大肥鱼.json');
  if (j) { const sheet = await img(dir + encodeURIComponent(asepriteImage(j))); got = sheet ? parseAseprite(j, sheet) : { acts: {}, warn: ['大肥鱼.json 写的图片「' + asepriteImage(j) + '」找不到'] }; }
  else { const t = await get(dir + '时长.txt', true); if (t != null) got = await parseFolder(t, p => img(dir + p)); }
  useSprite(got?.acts || {}, got?.warn, dir); return SPRITE;
}
// 换上一套帧（读进来的，或编辑器检查页送来的）；查出来的问题打在控制台
export function useSprite(acts, warn = [], from = '') {
  const ck = checkSprite(acts);
  Object.assign(SPRITE, { ok: ck.ok, acts: ck.ok ? acts : {}, from, warn: [...warn, ...ck.warn] });
  if (ck.ok) Object.assign(SPRITE, { size: ck.info.w, scale: ck.info.scale, desk: ck.info.desk });
  if (SPRITE.warn.length && from) console.warn('工位立绘：', SPRITE.warn.join('；'));
  ALPHA = null; if (ck.ok) layout(); return SPRITE;
}
// 画布贴进房间：桌面线对齐房间 DESK_Y，左边贴 x=0；有 idle 时点她的区域改成画布在桌面以上的部分
const DESK = DESK_Y;   // 基础.js 的 DESK_Y（不从 工位.js 拿，免得两个模块互相引用）
function layout() {
  const S = SPRITE, top = DESK - S.desk * S.scale;
  for (const id of ['fishspr', 'fishguide']) { const c = $(id); c.width = S.size; c.height = S.size; Object.assign(c.style, { top: top + 'px', width: S.size * S.scale + 'px', height: S.size * S.scale + 'px' }); }
  if (S.acts.idle) Object.assign($('fishhit').style, { left: '0px', top: top + 'px', width: S.size * S.scale + 'px', height: S.desk * S.scale + 'px' });
  const g = $('fishguide'); g.style.display = GUIDES ? 'block' : 'none'; if (GUIDES) drawTemplate(g.getContext('2d'), S.scale);
}
// 检查页的参考线：出图模板叠在她身上
let GUIDES = false;
export function showGuides(on) { GUIDES = on; layout(); }

// ---------- 播 ----------
let TM = 0, FILTER = null, NOW = null;
// 夜间光影（光影.js）给每一帧过一遍滤镜；换了滤镜马上重画当前这一帧
export function setFrameFilter(fn) { FILTER = fn; }
export function redrawSprite() { NOW?.(); }
// 这个状态有帧就播它，没有就播 idle 顶上；一张都没有返回 false（工位用占位图）。播一次的播完调 done
export function playSprite(state, done) {
  clearTimeout(TM);
  const s = SPRITE.ok ? (SPRITE.acts[state] ? state : SPRITE.acts.idle ? 'idle' : null) : null;
  $('room').classList.toggle('spr', !!s); if (!s) return false;
  const seq = SPRITE.acts[s], once = ONCE.has(state) && s === state, x = $('fishspr').getContext('2d');
  let i = 0;
  NOW = () => { x.clearRect(0, 0, SPRITE.size, SPRITE.size); x.drawImage(FILTER ? FILTER(seq[i].c) : seq[i].c, 0, 0); };
  const step = () => {
    NOW();
    TM = setTimeout(() => { if (++i >= seq.length) { if (once) return done?.(); i = 0; } step(); }, seq[i].ms);
  };
  step(); return true;
}
// 这个动作的道具是不是画在她手里（是的话房间别再画桌上那份）
export const holds = act => SPRITE.ok && !!SPRITE.acts[act] && !!HOLD[act];
// 对话栏的小头像：idle 第 1 帧按头像框裁；没有 idle 返回 false
export function spriteAvatar(x, size = 24) {
  const f = SPRITE.acts.idle?.[0]; if (!f) return false;
  const k = SPRITE.scale === 1 ? 2 : 1; x.drawImage(f.c, AVA.x * k, AVA.y * k, AVA.s * k, AVA.s * k, 0, 0, size, size); return true;
}
// 点她：按 idle 第 1 帧有没有颜色判断；点到透明处把这一下让给后面的东西。没有 idle 时不管（null）
let ALPHA = null;
export function spriteHit(cx, cy) {
  const f = SPRITE.acts.idle?.[0]; if (!f) return null;
  if (!ALPHA || ALPHA.f !== f) ALPHA = { f, a: f.c.getContext('2d').getImageData(0, 0, f.c.width, f.c.height).data };
  const r = $('fishspr').getBoundingClientRect(), px = Math.floor((cx - r.left) / r.width * SPRITE.size), py = Math.floor((cy - r.top) / r.height * SPRITE.size);
  return px >= 0 && py >= 0 && px < SPRITE.size && py < SPRITE.size && ALPHA.a[(py * SPRITE.size + px) * 4 + 3] > 0;
}
export function bindHit(el) {
  el.addEventListener('mousemove', e => { el.style.cursor = spriteHit(e.clientX, e.clientY) === false ? 'default' : ''; });
  el.addEventListener('click', e => {   // 捕获阶段先过一遍：透明处不算点到她
    if (spriteHit(e.clientX, e.clientY) !== false) return;
    e.stopImmediatePropagation(); el.style.pointerEvents = 'none'; const t = document.elementFromPoint(e.clientX, e.clientY); el.style.pointerEvents = ''; t?.click();
  }, true);
}
