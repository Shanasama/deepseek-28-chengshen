// 训练的数值：权重分按问题类型分开算（v3.7）。夜里的盘面把 G.adj[本轮问题类型] 交给 规则.js。
// 第 3 步会把这里的计算并进 剧情编辑器/规则.js 并补测试，这里只留调用。
import { G, QT, AXES } from './状态.js';
import { AT } from './基础.js';

export const NUM = { base: { formal: 2.0, knowledge: 1.6, colloquial: 1.5, logic: 1.4, narrative: 1.3, open: 1.2 }, open0: 1.1, deep: .35, gain: .7, loss: .35, floor: .1, perBatch: 3, rerollCost: 1 };
// 某个问题类型下某个属性的权重分；没学过的返回 null（开放多样性 0 级永远垫底在场）
export function w(t, a) {
  const st = G.stage[a]; if (!st && a !== 'open') return null;
  const base = st ? NUM.base[a] + (st === 2 ? NUM.deep : 0) : NUM.open0;
  return Math.max(NUM.floor, base + ((G.adj[t] || {})[a] || 0));
}
// 后训练的加减分：只改这一个问题类型；保底 0.1。这一块以后可以整个换掉（v3 §4）
export function nudge(t, a, d) { const cur = w(t, a), nv = Math.max(NUM.floor, cur + d); G.adj[t] = G.adj[t] || {}; G.adj[t][a] = (G.adj[t][a] || 0) + (nv - cur); return nv - cur; }
// 成对回答的两个属性：从已解锁属性里随机抽，开放多样性没学时以 0 级身份陪跑；换一对时尽量不和上一对一样
export function pickPair(avoid) {
  const pool = AXES.filter(a => G.stage[a] > 0 || a === 'open'), key = p => p.slice().sort().join();
  for (let k = 0; k < 8; k++) { const p = shuffle(pool.slice()).slice(0, 2); if (!avoid || pool.length <= 2 || key(p) !== key(avoid)) return p; }
  return shuffle(pool.slice()).slice(0, 2);
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const isNoise = a => a === 'open' && G.stage.open === 0;
export const tagName = a => isNoise(a) ? '开放多样性·0级' : AT[a].n;
export function gib() { const cs = '的了是我你吗吧啊##@@&&%%¥¥呃……嗯嗯嗯ΩΣ▒▒'; let s = ''; for (let i = 0; i < 26; i++) s += cs[Math.random() * cs.length | 0]; return s; }
// 今天开始时的快照（六维图的虚线）
export function snapPrev() { G.prev = Object.fromEntries(QT.map(t => [t, Object.fromEntries(AXES.map(a => [a, w(t, a)]))])); }
// 预训练学会一类语料
export function learn(a) { const lv = G.stage[a]; G.stage[a] = lv + 1; if (a === 'open' && lv === 0) QT.forEach(t => { if (G.adj[t]) delete G.adj[t].open; }); return lv; }
