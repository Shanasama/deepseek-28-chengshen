// 基础工具：调色板、属性表、像素图标、分词、舞台缩放、提示条。别的模块都从这里拿。
import { G, spd } from './状态.js';
import { SFX } from './音频.js';

export const P = {
  abyss: '#0A1030', night: '#121A42', navy: '#1B2560', deep: '#263489', cobalt: '#3F6EE8', sky: '#5AA0FF', cyan: '#8FD3FF', ice: '#C9ECFF',
  k0: '#000000', k1: '#0C0C0D', k2: '#151517', k3: '#1E1E21', k4: '#2A2A2E', k5: '#3C3C41', t3: '#6E6E75', t2: '#9C9CA3', t15: '#C9C9CE', t1: '#EDEDEF',
  ink: '#0E1018', paper: '#F8FAFF', mist: '#E9ECF4', g1: '#4A5272', g2: '#6D7594', g3: '#9AA2BD', g4: '#C7CDE0', c1: '#1D2133', c2: '#2E3450',
  gold: '#E8A93A', lgold: '#FFD57A', skin: '#FFE3D0', skinS: '#F0B49A', peach: '#FFC9A8', rose: '#F07FB0', mint: '#4FCF8A', teal: '#4FD8D0',
  red: '#E8434F', purple: '#8A4DFF', lpurple: '#C2A6FF', good: '#2E9A5E',
};
// 六个属性：名字、颜色、喂养它的网站、浅层 / 深层学到什么、预训练时显示器上的应用、她出门前说的话
export const AT = {
  knowledge: { n: '知识覆盖', s: '知识', c: P.cobalt, site: '百科站', slug: 'baike', app: 'wiki', lv: ['百科词条', '学术论文'], go: '好嘞，百科站走起，争取今天当个小百科！' },
  colloquial: { n: '口语活力', s: '口语', c: P.gold, site: '贴吧论坛', slug: 'tieba', app: 'chat', lv: ['日常闲聊', '暴躁老哥'], go: '冲浪时间到！我去贴吧学学怎么说人话～' },
  narrative: { n: '叙事修辞', s: '叙事', c: P.rose, site: '小说站', slug: 'novel', app: 'novel', lv: ['网文对白', '文学名著'], go: '去小说站看几章，顺便偷师怎么讲故事。' },
  logic: { n: '结构逻辑', s: '逻辑', c: P.mint, site: '技术文档', slug: 'docs', app: 'ide', lv: ['操作步骤', '代码问答'], go: '技术文档啊……行，我泡杯咖啡慢慢啃。' },
  formal: { n: '正式模板', s: '正式', c: P.g3, site: '官网客服', slug: 'gov', app: 'doc', lv: ['客服话术', '法律条文'], go: '官网话术是吧，我会变得非常「您好」。' },
  open: { n: '开放多样性', s: '开放', c: P.teal, site: '评论区弹幕', slug: 'random', app: 'danmaku', lv: ['评论区接梗', '野生黑话'], go: '去评论区和弹幕里捡点野生梗！' },
};
// 夜间卡牌的配色（含基础直觉、坦白、彩蛋、0 级乱码）
export const ATTR = {
  knowledge: { n: '知识覆盖', c: P.cobalt }, colloquial: { n: '口语活力', c: P.gold }, narrative: { n: '叙事修辞', c: P.rose }, logic: { n: '结构逻辑', c: P.mint },
  formal: { n: '正式模板', c: P.g3 }, open0: { n: '开放多样性·0级', c: P.teal, noise: true }, open: { n: '开放多样性', c: P.teal }, confess: { n: '坦白', c: P.t2 },
  intuition: { n: '基础直觉', c: P.ice }, egg: { n: '彩蛋', c: P.purple },
};

export const $ = id => document.getElementById(id);
export const stage = document.getElementById('stage');
// 舞台上的一次性动画（震屏、故障、缩一下）播完就摘掉 class，免得残留的 class 下次被别的动画「唤醒」重播
stage.addEventListener('animationend', e => { if (e.target === stage) stage.classList.remove('shake', 'big', 'squish', 'g1', 'g2'); });
let S = 1, stageRect = stage.getBoundingClientRect();
export function fit() {
  const k = Math.min(innerWidth / 960, innerHeight / 540); S = k >= 1 ? Math.floor(k) : k;
  stage.style.transform = `scale(${S})`; stage.style.left = Math.round((innerWidth - 960 * S) / 2) + 'px'; stage.style.top = Math.round((innerHeight - 540 * S) / 2) + 'px';
}
export function updateStageRect() {
  // 舞台是 overflow:hidden，但浏览器的 scrollIntoView 仍可能把它卷动，卷了就拉回来
  if (stage.scrollTop || stage.scrollLeft) { stage.scrollTop = 0; stage.scrollLeft = 0; }
  stageRect = stage.getBoundingClientRect();
}
// 元素在舞台坐标里的位置（960×540 美术像素）
export function sp(el) { const r = el.getBoundingClientRect(); return { x: (r.left - stageRect.left) / S, y: (r.top - stageRect.top) / S, w: r.width / S, h: r.height / S }; }
export const deskXY = (x, y) => { const d = sp($('desk')); return { x: d.x + x, y: d.y + y }; };

export const wait = ms => new Promise(r => setTimeout(r, ms));
export const wt = ms => wait(ms / spd());          // 跟着倍速走的等待
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.random() * a.length | 0];
export const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const mod = (a, n) => ((a % n) + n) % n;
export const fmt = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export const restart = (el, c) => { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };
export const R = (x, c, X, Y, W, H) => { x.fillStyle = c; x.fillRect(X, Y, W, H); };
export const dith = (x, y) => ((x & 1) + ((y & 1) << 1)) / 4;
export const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };

let toastT = 0;
export function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 1800); SFX.blip(); }
export function deny(t, el) { toast(t); SFX.bad(); if (el) restart(el, 'shk'); }

// ---------- 像素圆角（clip-path 阶梯） ----------
(function () {
  const RADII = { r2: [1], r4: [2, 1], r8: [5, 3, 2, 1, 1], r12: [9, 6, 5, 4, 3, 2, 1, 1, 1] };
  let css = '';
  for (const [k, ins] of Object.entries(RADII)) {
    const n = ins.length, tl = [[0, n]]; for (let i = n - 1; i >= 0; i--) { tl.push([ins[i], i + 1], [ins[i], i]); }
    const Q = (x, y) => `${x} ${y}`, L = v => v + 'px', Rr = v => `calc(100% - ${v}px)`;
    const pts = [...tl.map(([x, y]) => Q(L(x), L(y))), ...tl.slice().reverse().map(([x, y]) => Q(Rr(x), L(y))),
      ...tl.map(([x, y]) => Q(Rr(x), Rr(y))), ...tl.slice().reverse().map(([x, y]) => Q(L(x), Rr(y)))];
    css += `.${k}{clip-path:polygon(${pts.join(',')})}`;
  }
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

// ---------- 像素图标 ----------
export function pxIcon(rows, pal, scale = 1) {
  const h = rows.length, wd = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas'); c.width = wd; c.height = h; const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } }));
  c.style.width = wd * scale + 'px'; c.style.height = h * scale + 'px'; return c;
}
export const ICON = {
  trophy: ['kk.kkkkk.kk', 'kYkYYYYYkYk', 'kYkYYwYYkYk', '.kkYYwYYkk.', '..kYYYYYk..', '...kYYYk...', '....kYk....', '....kYk....', '...kYYYk...', '..kkkkkkk..'],
  heart: ['.kkk...kkk.', 'kRRRk.kRwwk', 'kRRRRkRRRwk', 'kRRRRRRRRRk', 'kRRRRRRRRRk', '.kRRRRRRRk.', '..kRRRRRk..', '...kRRRk...', '....kRk....', '.....k.....'],
  snd: ['...k...', '..kk.k.', 'kkkk..k', 'kkkk.k.', 'kkkk..k', '..kk.k.', '...k...'],
  mute: ['...k...', '..kk...', 'kkkkk.k', 'kkkk.k.', 'kkkkk.k', '..kk...', '...k...'],
  tool: ['.kkk.', 'k...k', 'k.k.k', 'k...k', '.kkk.', '..k..', '..k..'],
  send: ['..k..', '.kkk.', 'k.k.k', '..k..', '..k..', '..k..'],
  copy: ['.kkkkk', '.k...k', 'kkkk.k', 'k..k.k', 'k..kkk', 'k..k..', 'kkkk..'],
  share: ['.....kk', '....k.k', 'kk.k...', 'k.k....', 'kk.k...', '....k.k', '.....kk'],
  up: ['...k....', '..kk....', '..kk....', 'kkkkkkk.', 'k.kk..kk', 'k.k...kk', 'k.k...k.', 'kkkkkkk.'],
  cur: ['k.......', 'kk......', 'kwk.....', 'kwwk....', 'kwwwk...', 'kwwwwk..', 'kwwwwwk.', 'kwwwkkkk', 'kwkwk...', 'kk.kwk..', 'k...kk..'],
  whale: ['..kkkk...k', '.kBBBBk.kk', 'kBwBBBBkBk', 'kBBBBBBBk.', '.kIIIIIk..', '..kkkkk...'],
  globe: ['.kkkkk.', 'k.k.k.k', 'kkkkkkk', 'k.k.k.k', 'kkkkkkk', 'k.k.k.k', '.kkkkk.'],
  chart: ['k......', 'k...k..', 'k..kk.k', 'k.kkk.k', 'kkkkkkk', 'kkkkkkk'],
  back: ['..k..', '.k...', 'kkkkk', '.k...', '..k..'], fwd: ['..k..', '...k.', 'kkkkk', '...k.', '..k..'],
  reload: ['.kkk.k', 'k...kk', 'k..kkk', 'k.....', 'k...k.', '.kkk..'],
  plus: ['...k...', '...k...', 'kkkkkkk', '...k...', '...k...'],
  chat: ['kkkkkkk', 'k.....k', 'k.k.k.k', 'k.....k', 'kkkkkkk', '.k.....', 'k......'],
  save: ['kkkkkk.', 'k.kk.kk', 'k.kk..k', 'kkkkkkk', 'k.....k', 'k.kkk.k', 'kkkkkkk'],
  gear: ['..k.k..', '.kkkkk.', 'kkk.kkk', 'kk...kk', 'kkk.kkk', '.kkkkk.', '..k.k..'],
  user: ['..kkk..', '.kkkkk.', '.kkkkk.', '..kkk..', '.......', '.kkkkk.', 'kkkkkkk'],
  bolt: ['...kk', '..kk.', '.kkk.', 'kkkkk', '.kkk.', '.kk..', 'kk...'],
  book: ['....................', '..kkkkkkk..kkkkkkk..', '.kBBBBBBBkkBBBBBBBk.', '.kBwwwwBBkkBBwwwwBk.', '.kBBBBBBBkkBBBBBBBk.', '.kBwwwBBBkkBBBwwwBk.',
    '.kBBBBBBBkkBBBBBBBk.', '.kBwwwwwBkkBwwwwwBk.', '.kBBBBBBBkkBBBBBBBk.', '.kBwwwBBBkkBBBwwwBk.', '.kBBBBBBBkkBBBBBBBk.', '.kBBBBBBBkkBBBBBBBk.',
    '..kkkkkkkkkkkkkkkk..', '...kGGGGGGGGGGGGk...', '....kkkkkkkkkkkk....'],
  scale: ['.........k..........', '........kGk.........', '.kkkkkkkkGkkkkkkkk..', '..k......k......k...', '.kAk.....k.....kBk..', 'kAAAk....k....kBBBk.',
    'kkkkk....k....kkkkk.', '.........k..........', '.........k..........', '.......kkkkk........', '......kGGGGGk.......', '.....kkkkkkkkk......'],
  bowl: ['......w...w.........', '.....w...w..........', '......w...w.........', '...kkkkkkkkkkkkk....', '..kwwwwwwwwwwwwwk...', '.kwwwwwwwwwwwwwwwk..',
    'kkkkkkkkkkkkkkkkkkk.', 'kBBBBBBBBBBBBBBBBBk.', '.kBBBwBBBBBBBwBBBk..', '..kBBBBBBBBBBBBBk...', '...kkBBBBBBBBBkk....', '.....kkkkkkkkk......'],
};
export const DOWN = ICON.up.slice().reverse();
export const KID = ['', '        kkkkkkkk', '      kkGGGGGGGGkk', '     kGGGGGGGGGGGGk', '     kGgGGGGGGGGGGk', '    kGGGGGGGGGGGGGGkkk',
  '    kkkkkkkkkkkkkkkGGGk', '    khhhhhhhhhhhhhhkkkk', '    khhsssssssssshhk', '    khsssssssssssshk', '   kSsseessssssseesSk',
  '   kSsseessssssseesSk', '   kSssssssssssssssSk', '    kssPssssssssPssk', '    kssssskkkkssssk', '     kkssssssssskk',
  '       kkkkkkkkk', '      kBBBwwwwBBBk', '    kkBBBBwwBBBBBBkk', '   kBBBBBBBBBBBBBBBBk', '   kBBBBBBBBBBBBBBBBk',
  '   kBBBkBBBBBBBBkBBBk', '   kBBBkBBBBBBBBkBBBk', '   kkkkkkkkkkkkkkkkkk'];
export const TIBO = ['', '     kkkkkkkk', '    khhhhhhhhk', '   khhhhhhhhhhk', '   khssssssssshk', '   kssssssssssk', '   kKKKKKKKKKKk', '   kKKKKKKKKKKk',
  '   ksssssSsssssk', '   kssssssssssk', '    kssskkksssk', '    ksssssssk', '     kkkkkkk', '    kMMMwwMMMk', '   kMMMMwwMMMMk', '   kMMMMMMMMMMk'];
// 没有头像的用户：临时点阵（同一个底座，按名字换发色和衣服色；美术部以后统一做头像）
export function phAvatar(name, scale = 2) {
  let h = 0; for (const ch of name || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hair = [P.ink, P.c1, P.g1, P.gold, P.paper, P.deep][h % 6], cloth = [P.cobalt, P.rose, P.mint, P.gold, P.g2, P.teal, P.purple][(h >> 3) % 7];
  return pxIcon(KID, { k: P.ink, G: hair, g: hair, h: hair, s: P.skin, S: P.skinS, e: P.ink, P: P.peach, B: cloth, w: P.paper }, scale);
}

// ---------- 分词：中文按词，标点并入前一个 token ----------
const SEG = window.Intl && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
export function tokenize(text) {
  const raw = SEG ? [...SEG.segment(text)].map(s => s.segment) : (text.match(/.{1,2}/gs) || []);
  const out = []; let pendOpen = '';
  for (const s of raw) {
    if (/^[「『（(《“]+$/.test(s)) { pendOpen += s; continue; }
    if (/^[\s\p{P}～…]+$/u.test(s) && out.length) { out[out.length - 1] += s; continue; }
    out.push(pendOpen + s); pendOpen = '';
  }
  if (pendOpen) out.push(pendOpen);
  return out;
}

// ---------- 正文 markdown（剧本里的正文、思考链支持 markdown；危险代码用 ==…== 标红） ----------
export const escH = t => (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
export const redMark = t => escH(t).replace(/==(.+?)==/g, '<mark class="red">$1</mark>');
export const stripMd = t => (t || '').replace(/^```.*$/gm, '').replace(/\*\*|==|`/g, '').replace(/\n{3,}/g, '\n\n').trim();
export function mdRender(s) {
  const inl = x => redMark(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  const out = []; let list = null, code = null;
  for (const line of (s || '').split('\n')) {
    if (/^```/.test(line.trim())) { if (code) { out.push('<pre class="code">' + code.map(redMark).join('\n') + '</pre>'); code = null; } else { code = []; list = null; } continue; }
    if (code) { code.push(line); continue; }
    const ol = line.match(/^\s*\d+\.\s+(.*)/), ul = line.match(/^\s*[-*]\s+(.*)/);
    if (ol || ul) { const t = ol ? 'ol' : 'ul'; if (!list || list.t !== t) { list = { t, items: [] }; out.push(list); } list.items.push(inl((ol || ul)[1])); continue; }
    list = null; if (line.trim()) out.push('<p>' + inl(line) + '</p>');
  }
  return out.map(x => typeof x === 'string' ? x : `<${x.t}>${x.items.map(i => '<li>' + i + '</li>').join('')}</${x.t}>`).join('');
}
export { G, spd };
