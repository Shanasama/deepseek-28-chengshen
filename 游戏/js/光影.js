// 光影（美术规范 §8.7、§2 例外）。设置里「光影效果」开着时有，白天、夜里各一套：
// 夜里照《空洞骑士》那种感觉：
// · 屋里压暗偏冷（CSS 滤镜，body.lit），显示器、分词机不压——它们是光源
// · 她大半在影子里，朝显示器那一侧亮一圈边
// · 显示器一团光晕（跟着屏幕起伏、吐 token 闪一下；慢镜头时换成候选的属性色）、屏幕泛光、光点、月光、暗角
// 白天是阳光从右上角的大窗户照进来，跟着游戏里的钟变（早上偏白、中午最亮、傍晚橘金、天擦黑时屋里暗下来，接上夜里）：
// · 不压暗屋子（白天要看训练菜单，可读性优先），只往上加光；傍晚才给屋里调一点暖色、暗一点（body.litday + --dayf）
// · 斜进来的几道光柱，光柱里的灰尘亮起来；窗户泛光；她朝窗户那一侧（右上）镶一圈暖边
// 她身上的明暗和亮边都按像素一格一格算（分档），占位图和正式立绘的每一帧都过一遍、缓存起来；叠在上面的光是柔的。
// 不跟别的模块要通知：主循环每帧调 drawLight，自己看昼夜、钟点和开关变没变。
import { G } from './状态.js';
import { P, ATTR, $ } from './基础.js';
import { NODE } from './转盘.js';
import { fishImg, FISH, DUST, MON } from './工位.js';
import { SPRITE, setFrameFilter, redrawSprite } from './立绘.js';

export const lightOn = () => G.nightLight !== false;   // 设置项沿用 nightLight 这个名字（本机存过的设置照样认），现在白天夜里一起管
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const RIM = rgb('#AAE1FF'), SKY = rgb(P.sky);
const mix = (o, c, k) => [o[0] + (c[0] - o[0]) * k, o[1] + (c[1] - o[1]) * k, o[2] + (c[2] - o[2]) * k];
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- 白天的钟点：9:00 → 18:00 记成 0 → 1，分四段（她身上的亮边按段换色，光柱的颜色、角度连续变） ----------
const dayT = () => Math.max(0, Math.min(1, (G.clock - 9 * 60) / (9 * 60)));
const BANDS = [   // 到哪个 t 为止、亮边颜色、光柱颜色和浓度、光柱斜度（越小越平越长）、屋里的滤镜
  { to: .25, name: '早上', rim: '#FFF6E2', beam: [255, 244, 214], a: .26, slant: 1.5, f: 'none' },
  { to: .6, name: '中午', rim: '#FFEBB0', beam: [255, 232, 168], a: .3, slant: 2.2, f: 'none' },
  { to: .9, name: '傍晚', rim: '#FFB870', beam: [255, 176, 100], a: .36, slant: .9, f: 'sepia(.22) saturate(1.1) brightness(.93)' },
  { to: 2, name: '天擦黑', rim: '#FF9C6A', beam: [255, 140, 96], a: .26, slant: .6, f: 'sepia(.3) saturate(1.05) brightness(.8)' },
];
const bandOf = t => BANDS.findIndex(b => t < b.to);

// ---------- 她身上：k = 亮边几个像素宽 ----------
const SHADE = new Map();   // 'night' / 'day0'…'day3' → WeakMap(帧 → 算好的帧)
function shadeWith(src, key, fn) {
  let m = SHADE.get(key); if (!m) SHADE.set(key, m = new WeakMap()); let c = m.get(src); if (c) return c;
  const w = src.width, h = src.height; c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0); const d = x.getImageData(0, 0, w, h), a = d.data, o = new Uint8ClampedArray(a);
  const on = (X, Y) => X >= 0 && X < w && Y >= 0 && Y < h && a[(Y * w + X) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) { const i = (y * w + X) * 4; if (!a[i + 3]) continue; const v = fn(a, i, X, y, w, on); o[i] = v[0]; o[i + 1] = v[1]; o[i + 2] = v[2]; }
  d.data.set(o); x.putImageData(d, 0, 0); m.set(src, c); return c;
}
// 夜里：压暗偏冷 + 朝右（显示器）的亮边
const shadeNight = (src, k) => shadeWith(src, 'night', (a, i, X, y, w, on) => {
  let v = [a[i] * .38 + 6, a[i + 1] * .42 + 10, a[i + 2] * .55 + 26];
  const t = X / w, e1 = !on(X + k, y) || !on(X + k, y - k), e2 = !on(X + 2 * k, y) || !on(X + 3 * k, y - k);
  if (t > .25 && e1) v = mix(v, RIM, .85); else if (t > .25 && e2) v = mix(v, SKY, .4);
  else { const s = Math.max(0, Math.min(1, (t - .25) / .6)); v = mix(v, SKY, .14 * s * s * (3 - 2 * s)); }   // 越靠显示器越蓝，慢慢过渡（以前在 .55 一刀切，脸被劈成两半）
  return v;
});
// 白天：不压暗；朝窗户（右上）的一圈暖边，背光的左下一点点冷影，给个体积感
const shadeDay = (src, k, bi) => { const B = BANDS[bi], rim = rgb(B.rim), dusk = bi >= 2; return shadeWith(src, 'day' + bi, (a, i, X, y, w, on) => {
  let v = [a[i], a[i + 1], a[i + 2]];
  if (dusk) v = mix(v, [a[i] * .85 + 20, a[i + 1] * .8 + 6, a[i + 2] * .72], .6);   // 傍晚她也染上一点暖色、暗一点
  const t = X / w, e1 = (!on(X + k, y) && t > .3) || (!on(X, y - k) && !on(X + k, y - k)), e2 = (!on(X + 2 * k, y) && t > .3) || !on(X + k, y - 2 * k);
  if (e1) v = mix(v, rim, .5); else if (e2) v = mix(v, rim, .16); else if (t < .3 && (!on(X - k, y) || !on(X, y + k))) v = mix(v, [74, 82, 114], .18);
  return v;
}); };

// ---------- 开 / 关（key：off / night / day0…day3） ----------
let KEY = null; const SRC = {};
function apply(key) {
  KEY = key; const night = key === 'night', day = key.startsWith('day'), bi = day ? +key.slice(3) : -1, k = () => SPRITE.scale === 2 ? 1 : 2;
  document.body.classList.toggle('lit', night); document.body.classList.toggle('litday', day);
  if (day) document.body.style.setProperty('--dayf', BANDS[bi].f);
  setFrameFilter(night ? c => shadeNight(c, k()) : day ? c => shadeDay(c, k(), bi) : null); redrawSprite();
  if (FISH.base) {   // 占位图是 <img>：换成算好光的那张
    const want = key === 'off' ? FISH.day : SRC[key] ||= (night ? shadeNight(FISH.base, 2) : shadeDay(FISH.base, 2, bi)).toDataURL();
    if (fishImg.src !== want) fishImg.src = want;
  }
  if (night) drawVignette();
}
const keyNow = () => !lightOn() ? 'off' : G.mode === 'night' ? 'night' : 'day' + bandOf(dayT());
function drawVignette() {
  const x = $('vig').getContext('2d'); x.clearRect(0, 0, 600, 486);
  const g = x.createRadialGradient(290, 300, 110, 290, 280, 400); g.addColorStop(0, 'rgba(6,8,26,0)'); g.addColorStop(1, 'rgba(6,8,26,.82)');
  x.fillStyle = g; x.fillRect(0, 0, 600, 486);
}

// ---------- 每帧 ----------
const COL = SKY.slice(); let NODE_K = 0;
function nodeColor() {   // 慢镜头：指针扫到的、命中的、鼠标停着的那张卡的属性色
  if (!G.nodeOn) return SKY;
  const i = NODE.state === 'spinning' ? NODE.under : NODE.hit >= 0 ? NODE.hit : NODE.hover, c = NODE.cards[i];
  return c && ATTR[c.attr] ? rgb(ATTR[c.attr].c) : SKY;
}
export function drawLight(now, dt) {
  const key = keyNow(), cls = document.body.classList;
  if (key !== KEY || cls.contains('lit') !== (key === 'night') || cls.contains('litday') !== key.startsWith('day')) apply(key);   // setMode 会整个换掉 body 的 class
  if (key === 'night') drawNight(now, dt); else if (key !== 'off') drawDay(now, dt);
}
function drawNight(now, dt) {
  const tc = nodeColor(); for (let j = 0; j < 3; j++) COL[j] += (tc[j] - COL[j]) * Math.min(1, dt * 6);
  NODE_K += ((G.nodeOn ? 1 : 0) - NODE_K) * Math.min(1, dt * 4);   // 慢镜头时光更强、照得更远（整个房间跟着换色）
  const [r, g, b] = COL.map(Math.round), k = .26 + .05 * Math.sin(now / 1300) + Math.min(.3, G.glow * .25) + NODE_K * .22;
  const c = $('light'), x = c.getContext('2d'); x.clearRect(0, 0, 600, 486);
  const cx = MON.x + MON.w / 2, cy = MON.y + MON.h / 2;
  let gr = x.createRadialGradient(cx, cy, 8, cx, cy, 200 + NODE_K * 120); gr.addColorStop(0, `rgba(${r},${g},${b},${k})`); gr.addColorStop(.5, `rgba(${r},${g},${b},${k * .32})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 600, 486);
  x.drawImage(soft('moon', '', 22, m => {   // 窗外斜进来的月光：糊开，没有硬边
    const q = m.createLinearGradient(560, 20, 330, 470); q.addColorStop(0, 'rgba(201,236,255,.11)'); q.addColorStop(1, 'rgba(201,236,255,0)');
    m.fillStyle = q; m.beginPath(); m.moveTo(430, 20); m.lineTo(590, 20); m.lineTo(430, 470); m.lineTo(270, 470); m.closePath(); m.fill();
  }), 0, 0);
  x.filter = 'blur(6px)'; x.globalAlpha = .75;   // 泛光：屏幕和分词机模糊一份叠上去
  for (const id of ['scr', 'tokdev']) { const e = $(id); x.drawImage(e, e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight); }
  x.filter = 'none'; x.globalAlpha = 1;
  for (const d of DUST) {   // 光点：显示器附近的灰尘带一圈柔光
    const dist = Math.hypot(d.x - cx, d.y - cy); if (dist > 190 || Math.sin(now / 900 + d.p) <= -.3) continue;
    const s = 3 + (d.p % 2), a = .55 * (1 - dist / 190), q = x.createRadialGradient(d.x, d.y, 0, d.x, d.y, s * 3);
    q.addColorStop(0, `rgba(201,236,255,${a})`); q.addColorStop(1, 'rgba(143,211,255,0)'); x.fillStyle = q; x.fillRect(d.x - s * 3, d.y - s * 3, s * 6, s * 6);
  }
}
// 白天：光柱从窗户的三格（中间有窗框）斜着往左下打到桌面和地上，窗边一大片散光；整层模糊开（《空洞骑士》那种柔，没有硬边），
// 只在钟点变了才重画（缓存），每帧只是叠上去、轻轻起伏。颜色、浓度、斜度在相邻两段之间连续过渡
function drawDay(now) {
  const t = dayT(), bi = bandOf(t), B = BANDS[bi], N = BANDS[Math.min(3, bi + 1)], lo = bi ? BANDS[bi - 1].to : 0, f = Math.max(0, Math.min(1, (t - lo) / (B.to - lo)));
  const ease = f < .7 ? 0 : (f - .7) / .3;   // 每段最后三成往下一段过渡
  const col = B.beam.map((v, j) => Math.round(lerp(v, N.beam[j], ease))), A = lerp(B.a, N.a, ease), slant = lerp(B.slant, N.slant, ease);
  const c = $('light'), x = c.getContext('2d'); x.clearRect(0, 0, 600, 486);
  const w = $('win'), wx = w.offsetLeft, wy = w.offsetTop, ww = w.offsetWidth, wh = w.offsetHeight, floor = 486;
  const beams = [[.04, .32], [.34, .66], [.68, .98]];   // 窗户横着分三格
  const run = (floor - wy) / slant, top = wy + wh * .1;   // 光从窗口落到地上往左走多远
  const layer = soft('day', bi + '|' + Math.round(t * 120), 9, m => {
    for (const [p0, p1] of beams) {
      const x0 = wx + ww * p0, x1 = wx + ww * p1, gr = m.createLinearGradient(x1, wy, x1 - run, floor);
      gr.addColorStop(0, `rgba(${col},${A * 1.9})`); gr.addColorStop(.5, `rgba(${col},${A * 1.05})`); gr.addColorStop(1, `rgba(${col},0)`);
      m.fillStyle = gr; m.beginPath(); m.moveTo(x0, top); m.lineTo(x1, top); m.lineTo(x1 - run, floor); m.lineTo(x0 - run, floor); m.closePath(); m.fill();
      const back = (390 - top) / slant, lx0 = x0 - back, lx1 = x1 - back, sp = m.createLinearGradient(0, 382, 0, 404);   // 落到桌面上的亮斑
      sp.addColorStop(0, `rgba(${col},${A * 1.5})`); sp.addColorStop(1, `rgba(${col},0)`); m.fillStyle = sp; m.beginPath(); m.moveTo(lx0, 386); m.lineTo(lx1, 386); m.lineTo(lx1 - 18 / slant, 404); m.lineTo(lx0 - 18 / slant, 404); m.closePath(); m.fill();
    }
    const hz = m.createRadialGradient(wx + ww * .3, wy + wh * .85, 10, wx + ww * .3, wy + wh * .85, 300);   // 窗边一大片散光
    hz.addColorStop(0, `rgba(${col},${A * .55})`); hz.addColorStop(1, `rgba(${col},0)`); m.fillStyle = hz; m.fillRect(0, 0, 600, 486);
  });
  x.save(); x.beginPath(); x.rect(0, 0, 600, 486); x.rect(wx, wy, ww, wh); x.clip('evenodd');   // 光不盖在窗户上（不然窗外的楼被冲白）
  x.globalAlpha = .9 + .1 * Math.sin(now / 2400); x.drawImage(layer, 0, 0);
  x.filter = 'blur(10px)'; x.globalAlpha = bi >= 2 ? .6 : .45; x.drawImage(w, wx, wy, ww, wh); x.filter = 'none'; x.globalAlpha = 1;   // 窗户泛光：只在窗框外面晕开一圈
  x.restore();
  for (const d of DUST) {   // 光柱里的灰尘亮起来（柔光点）
    if (Math.sin(now / 900 + d.p) <= -.3 || d.y < wy) continue;
    const back = (d.y - top) / slant; if (!beams.some(([p0, p1]) => d.x >= wx + ww * p0 - back && d.x <= wx + ww * p1 - back)) continue;
    const s2 = 3 + (d.p % 2), q = x.createRadialGradient(d.x, d.y, 0, d.x, d.y, s2 * 3);
    q.addColorStop(0, `rgba(${col},.5)`); q.addColorStop(1, `rgba(${col},0)`); x.fillStyle = q; x.fillRect(d.x - s2 * 3, d.y - s2 * 3, s2 * 6, s2 * 6);
  }
}
// 模糊过的光层：key 变了才重画（模糊整张 600×486 比较费，钟点不动就一直用这一张）
const SOFTC = new Map();
function soft(name, key, blur, paint) {
  const e = SOFTC.get(name); if (e && e.key === key) return e.c;
  const mk = () => { const c = document.createElement('canvas'); c.width = 600; c.height = 486; return c; };
  const raw = mk(); paint(raw.getContext('2d'));
  const out = e?.c || mk(), o = out.getContext('2d'); o.clearRect(0, 0, 600, 486); o.filter = `blur(${blur}px)`; o.drawImage(raw, 0, 0); o.filter = 'none';
  SOFTC.set(name, { key, c: out }); return out;
}
