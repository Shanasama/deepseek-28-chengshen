// 新手教学（v3 §2、美术规范 §10.12）：不设引导员，用聚光灯——画面压暗，只亮出要教的地方，旁边一个像素箭头 + 一句说明。
//   剧情占位页：新游戏开头，「此处应有剧情😀」RGB 跑马灯，剧情写好以后整页换掉。
//   Day 0 出厂测试：夜里接待测试员，教读卡、扇区、空格开转；第一转一定停在乱码上，教剔除重转；第 1、2 轮之间装上口语模块。
//   第 1 天：教学题之后，聚光灯依次指今晚来访预告、白天活动菜单、开始营业；各活动第一次打开时再提示一次。
//   第 1 晚起：抹除、下线扣心、被识破，各提示一次。提示看过就不再出（存档.js 的 tipSeen）。
import { G } from './状态.js';
import { $, P, sp, wait, restart, pxIcon, AT, deskXY, toast } from './基础.js';
import { SFX } from './音频.js';
import { flash, shake, ring, burst, confetti, floatAt, banner, vignette } from './特效.js';
import { setScreen, setFish, drawRoomItems, POP } from './工位.js';
import { addLog } from './对话栏.js';
import { drawer } from './界面.js';
import { NODE, setNodeHook } from './转盘.js';
import { learn } from './训练.js';
import { tipSeen, tipMark } from './存档.js';

const ARROW = ['...kkk...', '...kYk...', '...kYk...', '...kYk...', 'kkkkYkkkk', '.kYYYYYk.', '..kYYYk..', '...kYk...', '....k....'];
export const when = (fn, ms = 80) => new Promise(ok => { const t = setInterval(() => { if (fn()) { clearInterval(t); ok(); } }, ms); });

// ---------- 聚光灯 ----------
let CUR = null;
export const spotOn = () => !!CUR;
// target：元素 id / 元素 / {x,y,w,h}（舞台坐标）。until：'click' = 点一下（或 Enter / 空格）继续，聚光灯外的点击都被拦下；
// 传一个 Promise = 等玩家做完那件事，聚光灯不拦操作（要拦什么由调用方自己管，比如转盘的 NODE.allow）
// 每条提示至少要看 MIN 毫秒：期间点击和按键都被拦下，卡片右下角倒数
const MIN = 3000;
export function spot(target, text, { until = 'click', pad = 6 } = {}) {
  closeSpot();
  return new Promise(ok => {
    const s = $('spot'), hole = s.querySelector('.hole'), tip = s.querySelector('.stip'), arr = s.querySelector('.sarr'), click = until === 'click', go = s.querySelector('.sgo');
    s.querySelector('.st').textContent = text; go.style.display = ''; go.classList.add('wait');
    s.classList.add('on'); restart(tip, 'in'); SFX.note(); $('spotcatch').classList.add('on');
    const t0 = performance.now();
    const tick = () => { if (!alive) return; const left = Math.ceil((MIN - (performance.now() - t0)) / 1000);
      if (left > 0) { go.textContent = `${left} 秒后${click ? '可以继续' : '照提示操作'}`; setTimeout(tick, 100); return; }
      if (CUR) CUR.open = true; go.classList.remove('wait'); SFX.blip();
      if (click) go.textContent = '点一下继续 ▸'; else { go.style.display = 'none'; $('spotcatch').classList.remove('on'); } };
    const rect = () => { const el = typeof target === 'string' ? $(target) : target; return !el ? null : el.nodeType ? sp(el) : el; };
    let alive = true;
    (function place() {
      if (!alive) return; const r = rect();
      if (r) {
        const x = r.x - pad, y = r.y - pad, w = r.w + pad * 2, h = r.h + pad * 2;
        hole.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
        const below = y + h + 34 + tip.offsetHeight < 536, cx = x + w / 2;
        tip.style.left = Math.max(8, Math.min(952 - tip.offsetWidth, cx - tip.offsetWidth / 2)) + 'px';
        tip.style.top = (below ? y + h + 26 : y - 26 - tip.offsetHeight) + 'px';
        arr.style.left = (cx - 9) + 'px'; arr.style.top = (below ? y + h + 4 : y - 22) + 'px'; arr.classList.toggle('up', below);
      }
      requestAnimationFrame(place);
    })();
    const finish = () => { if (!alive) return; alive = false; s.classList.remove('on'); $('spotcatch').classList.remove('on'); if (CUR && CUR.finish === finish) CUR = null; ok(); };
    CUR = { finish, click, open: false }; tick();
    $('spotcatch').onclick = e => { e.stopPropagation(); if (!CUR || !CUR.open) { restart(tip, 'shk'); return; } if (click) { SFX.click(); finish(); } };
    if (!click) Promise.resolve(until).then(finish);
  });
}
export function closeSpot() { if (CUR) CUR.finish(); }
// 「点一下继续」的聚光灯吞掉按键（看满 3 秒后 Enter / 空格继续）；等操作的聚光灯看满 3 秒后放行
export function spotKey(e) {
  if (!CUR) return false;
  if (!CUR.open) { e.preventDefault(); return true; }   // 还没看满 3 秒：什么键都不放
  if (!CUR.click) return false;
  if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); SFX.click(); CUR.finish(); }
  return true;
}
// 只提示一次（跨局记在本机）
export async function tipOnce(key, target, text) { if (G.noSave || tipSeen(key)) return; tipMark(key); await spot(target, text); }

// ---------- 剧情占位页 ----------
let STORY = null;
export const storyOn = () => $('story').classList.contains('on');
export function story() {
  return new Promise(ok => {
    const el = $('story'), line = $('storyline'), txt = '此处应有剧情';
    line.innerHTML = [...txt].map((ch, i) => `<span style="animation-delay:${i * 90}ms">${ch}</span>`).join('') + `<span class="emo" style="animation-delay:${txt.length * 90}ms">😀</span>`;
    el.classList.add('on'); $('storygo').classList.remove('on'); SFX.slow();
    const spans = [...line.children].slice(0, txt.length); let step = 0;
    const tm = setInterval(() => { spans.forEach((s, k) => s.style.color = `hsl(${(k * 40 - step * 14 + 3600) % 360},95%,70%)`); step++; }, 60);
    let ready = false; setTimeout(() => { ready = true; $('storygo').classList.add('on'); }, 1500);
    STORY = () => { if (!ready) return; STORY = null; clearInterval(tm); SFX.confirm(); el.classList.add('out'); setTimeout(() => { el.classList.remove('on', 'out'); ok(); }, 300); };
    el.onclick = () => STORY && STORY();
  });
}
export function storyKey(e) { e.preventDefault(); STORY && STORY(); }

// ---------- Day 0 出厂测试（夜里） ----------
export const TUT = { on: false, node: 0 };
export function tutNight() { TUT.on = true; TUT.node = 0; }
export function tutEnd() { TUT.on = false; NODE.allow = null; NODE.rig = null; }
// 转盘的事件：ready（弹出、能开转了）/ stopped（停下了）
setNodeHook(async ev => {
  if (!TUT.on) return nightTips(ev);
  if (ev === 'ready' && TUT.node === 0) {
    TUT.node = 1; NODE.allow = new Set(); NODE.rig = 'open0';
    await spot('cands', '这是大肥鱼此刻想到的几种说法：左边是方案词，后面是预览。');
    await spot('wheel', '每种说法占转盘的一块。扇区越大，越容易转到。');
    await spot('pbar', '这是测试员的耐心。答得不好会掉，掉光了用户就下线。（测试员不会下线，放心试）');
    NODE.allow = new Set(['spin']); await spot('hints', '按空格开转。', { until: when(() => NODE.state !== 'ready') });
  } else if (ev === 'stopped' && TUT.node === 1) {
    TUT.node = 2; NODE.allow = new Set(['regen']);
    await spot('hints', '转到乱码了！按 R，花 1 点额度把它剔除，再转一次。', { until: when(() => NODE.state !== 'stopped') });
  } else if (ev === 'stopped' && TUT.node === 2) {
    TUT.node = 3; NODE.allow = new Set(['confirm']);
    await spot('hints', '这次像样了。按空格确认，大肥鱼就照这个说。', { until: when(() => NODE.state !== 'stopped') });
    NODE.allow = null;
  } else if (ev === 'ready' && TUT.node === 3 && G.prog >= 1) {
    TUT.node = 4; NODE.allow = new Set();
    const c = NODE.cards.find(x => x.attr === 'colloquial');
    if (c && c.row) await spot(c.row, '刚装上的口语活力上盘了。下班闲聊，试试它？');
    NODE.allow = null;
  }
});
// 第 1、2 轮之间：装上口语模块（不花行动点）
export async function installCorpus(a) {
  const A = AT[a]; setFish('stretch'); setScreen(A.app); SFX.launch();
  $('progt').textContent = '正在安装：' + A.n + '模块'; $('prog').classList.add('on');
  const t0 = performance.now(), dur = 1400;
  while (true) { const k = Math.min(1, (performance.now() - t0) / dur); $('progb').style.width = (k * 100) + '%'; $('progn').textContent = Math.round(k * 100) + '%'; if (k >= 1) break; await wait(16); }
  await wait(250); $('prog').classList.remove('on');
  const lv = learn(a); flash(); shake(true); drawRoomItems(); const p = deskXY(...POP[a]);
  ring(p.x, p.y, A.c, 40, 190); burst(p.x, p.y, A.c, 50, 260); confetti(p.x, p.y, 40); floatAt('装好了！', p.x - 24, p.y - 26, P.paper, true);
  SFX.unlock(); vignette('gold'); setFish('happy'); banner(`解锁 · ${A.n}`, `浅层「${A.lv[lv]}」`, A.c);
  addLog(`出厂测试 · 装上了${A.n}（浅层「${A.lv[lv]}」）`, 'k');
  await wait(900);
  await spot({ x: p.x - 34, y: p.y - 30, w: 68, h: 60 }, `工位上多了${A.n}的东西：从现在起，夜里会出现${A.n}的卡。白天的「预训练」就是干这个的。`);
  setScreen('console'); setFish('idle');
}

// ---------- 第 1 天白天的引导（教学题之后） ----------
export async function day1Guide() {
  drawer(true); await wait(380);
  await spot('vlist', '今晚这几位会来。线索藏在简介里：猜猜他们会问什么，白天就练什么。');
  drawer(false); await wait(260);
  await spot('dwin', `今天有 ${G.ap} 个行动点，想干啥干啥：每件事花 1 点。`);
  if ($('gobtn')) await spot('gobtn', '准备好了，就点这里开始营业。');
}

// ---------- 第 1 晚起的一次性提示 ----------
async function nightTips(ev) {
  if (ev !== 'ready' || G.day < 1 || tipSeen('erase')) return;
  NODE.allow = new Set(); await tipOnce('erase', 'wheel', '转之前，也可以长按一块扇区（半秒），花 1 点额度把它抹掉——不想要的说法，干脆别让它上盘。'); NODE.allow = null;
}
export const tipHeart = () => tipOnce('heart', 'hearts', '用户下线会扣 1 颗心。心没了，整局结束。白天「吃白饭」可以补心。');
export const tipCaught = () => tipOnce('caught', 'chead', '被识破了！察觉力高的用户更容易识破；同一晚每糊弄一次，识破的几率都会涨。');
export { ARROW };
