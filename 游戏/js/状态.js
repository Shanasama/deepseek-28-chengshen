// 一局游戏的全部状态都在这一个对象里：天数、心、额度、各问题类型的权重分、今晚的会话、统计……
// 以后存档 / 读档 / 回档就是存取这一份（第 4 步做）。别的模块只读写它，不各自藏状态。
export const QT = ['闲聊', '知识', '捣乱', '情感倾诉', '代码求助'];
export const AXES = ['knowledge', 'colloquial', 'narrative', 'logic', 'formal', 'open'];
export const SPEEDS = [{ m: .5, n: 'Low' }, { m: 1, n: 'Medium' }, { m: 2, n: 'High' }, { m: 3, n: 'Ultra' }];

export const G = {
  // —— 整局 ——
  mode: 'day',            // 'day' | 'night'
  day: 1,
  hearts: 3, heartMax: 5,
  quota: 10, quotaMax: 10, tiboUsed: false,
  rollbacks: 1,
  stage: {},              // 各属性的预训练阶段：0 未学 / 1 浅层 / 2 深层
  adj: {},                // 后训练调整：adj[问题类型][属性]（v3.7 按问题类型分开算）
  done: {},               // 各问题类型练过几题
  qSeen: {}, qSeq: 0,     // 后训练题目上次出现的序号（轮着出，先出最久没出过的）
  prev: null,             // 今天开始时的权重分快照（六维图的虚线）
  used: {},               // 每个用户已经用掉几个场景
  eggSeen: new Set(),     // 本局盘面出现过的彩蛋（单局去重）
  total: { like: 0, dislike: 0, lost: 0, bluff: 0, caught: 0, solved: 0, eggs: 0 },
  history: [],            // 每晚结束时记一行：{day, solved, lost, like, eggs, out}（最终评测的每日小结）
  noSave: false,          // 剧情编辑器的试玩：不读写存档、不记成就
  inTitle: false,
  // —— 当天 ——
  ap: 4, apMax: 4, post: 0, postMax: 2,
  clock: 9 * 60,
  tonight: [],            // 今晚来访：[{name, bio, dir, avatar, boss, repeat, scene}]
  sessions: [],           // 今晚的会话（一位用户一个）
  cur: -1,                // 正在进行的会话
  stats: { like: 0, dislike: 0, lost: 0, bluff: 0, caught: 0, solved: 0, eggs: 0 },
  // —— 夜间单场 ——
  patience: 100, prog: 0, retry: 0, bluffs: 0, hurt: false, phase: '',
  timeScale: 1, tsTarget: 1, tok: 0,
  // —— 界面 ——
  started: false, startT: 0, busy: false, view: 'menu', tab: 'desk', selfType: '知识',
  spd: 1, muted: false, vMusic: .6, vSfx: .8, glow: 0, bars: 0, nodeOn: false, musSlow: false, musHype: false, over: false,
};

export const freshStats = () => ({ like: 0, dislike: 0, lost: 0, bluff: 0, caught: 0, solved: 0, eggs: 0 });
export const spd = () => SPEEDS[G.spd].m;
