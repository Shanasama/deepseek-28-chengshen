// 训练：后训练的计算都在 剧情编辑器/规则.js（和编辑器共用），数字默认值在 登记表.postTrain、日程表可覆盖。
// 这里只把 G 的状态交给规则，再管一点只属于游戏的事：抽哪两个属性配对、出哪几道题。
import { G, QT, AXES } from './状态.js';
import { AT } from './基础.js';
import { DATA, bankFor } from './数据.js';

// 后训练的数字（每次现取：日程表覆盖了哪项就用哪项）
export const pt = () => RULES.ptParams(DATA.reg, DATA.sched && DATA.sched.postTrain);
// 某个问题类型下某个属性的权重分；没学过的返回 null（开放多样性 0 级永远垫底在场）
export function w(t, a) {
  const st = G.stage[a] || 0; if (!st && a !== 'open') return null;
  return RULES.attrWeight(a, st, DATA.reg, G.adj[t] || {});
}
// 一道题：在 t 类问题上选了 win、没选 lose。返回实际加减了多少
export function trainOne(t, win, lose) {
  const r = RULES.postTrain(G.adj, { qtype: t, win, lose, stages: G.stage, reg: DATA.reg, qtypes: QT, P: pt() });
  G.adj = r.adj; return r;
}
// 成对回答的两个属性：从已解锁属性里随机抽，开放多样性没学时以 0 级身份陪跑；换一对时尽量不和上一对一样
export function pickPair(avoid) {
  const pool = AXES.filter(a => G.stage[a] > 0 || a === 'open'), key = p => p.slice().sort().join();
  for (let k = 0; k < 8; k++) { const p = shuffle(pool.slice()).slice(0, 2); if (!avoid || pool.length <= 2 || key(p) !== key(avoid)) return p; }
  return shuffle(pool.slice()).slice(0, 2);
}
// 出哪几道题：先出没出过的，都出过了就出最久没出过的（题库每类只有 3 道，同一天练两次同一类就会轮回来）
export function pickQuestions(t, n) {
  const seen = id => G.qSeen[id] ?? -1;
  const qs = shuffle(bankFor(t).slice()).sort((x, y) => seen(x.id) - seen(y.id)).slice(0, n);
  qs.forEach(q => G.qSeen[q.id] = G.qSeq++);
  return qs;
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const isNoise = a => a === 'open' && G.stage.open === 0;
export const tagName = a => isNoise(a) ? '开放多样性·0级' : AT[a].n;
export function gib() { const cs = '的了是我你吗吧啊##@@&&%%¥¥呃……嗯嗯嗯ΩΣ▒▒'; let s = ''; for (let i = 0; i < 26; i++) s += cs[Math.random() * cs.length | 0]; return s; }
// 今天开始时的快照（六维图的虚线）
export function snapPrev() { G.prev = Object.fromEntries(QT.map(t => [t, Object.fromEntries(AXES.map(a => [a, w(t, a)]))])); }
// 预训练学会一类语料
export function learn(a) { const lv = G.stage[a] || 0; G.stage[a] = lv + 1; G.adj = RULES.afterLearn(G.adj, a, lv); return lv; }
