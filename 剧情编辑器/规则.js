// 大肥鱼夜间规则（v3 §4、§5.2、§5.5、§7、§8）：盘面怎么算、选中后怎么结算。
// 剧情编辑器（画布、试玩）和夜间 Demo 都调这一份，规则只在这里改。测试：node --test 剧情编辑器/规则.test.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RULES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const filled = o => !!o && Object.keys(o).length > 0;
  const attrOf = (reg, id) => reg.attrs.find(a => a.id === id);

  // 一张卡在当前训练状态下的阶段：0 没学 / 1 浅层 / 2 深层。基础直觉、坦白、特殊卡不分阶段
  function stageOf(c, stages) {
    if (c.attr === 'intuition' || c.attr === 'confess' || c.attr === 'special') return 1;
    return stages[c.attr] || 0;
  }
  // 没学过的属性不上盘；常驻属性（基础直觉、开放多样性）永远在
  function trained(c, reg, stages) {
    const ra = attrOf(reg, c.attr);
    return !!ra && (!!ra.always || c.attr === 'confess' || c.attr === 'special' || stageOf(c, stages) > 0);
  }
  // 按阶段取这张卡实际显示的版本：开放多样性没学 → 0 级乱码版；学到深层且写了深层版 → 深层版
  function variant(c, st) {
    if (c.attr === 'open' && st === 0) return { v: { ...c, ...c.lv0 }, tag: '0级' };
    if (st === 2 && filled(c.deep)) return { v: { ...c, ...c.deep }, tag: '深层' };
    return { v: c, tag: null };
  }
  // 权重分：属性起始分（开放多样性 0 级用 lv0Weight）+ 深层加成 + 后训练调整，保底 0.1。特殊卡固定 -99（不参与概率）
  function weight(c, st, reg, adj = {}) {
    if (c.attr === 'special') return -99;
    const ra = attrOf(reg, c.attr);
    let w = c.attr === 'open' && st === 0 ? ra.lv0Weight : ra.weight;
    if (st === 2) w += reg.deepBonus;
    return Math.max(0.1, w + (adj[c.attr] || 0));
  }
  function softmax(ws) {
    if (!ws.length) return [];
    const m = Math.max(...ws), ex = ws.map(w => Math.exp(w - m)), z = ex.reduce((a, b) => a + b, 0);
    return ex.map(e => e / z);
  }
  // 条件必出卡的条件（登记表 conditions）。ctx：{ri 第几轮(0 起), firstTry 此前各轮都一次推进, noOffend 此前没冒犯, prog 当前推进数}
  function condOK(appear, ctx) {
    if (!appear || appear.mode !== 'condition') return false;
    if (appear.cond === 'allFirstTryNoOffend') return ctx.ri > 0 && ctx.firstTry && ctx.noOffend;
    if (appear.cond === 'progressAtLeast') return ctx.prog >= (appear.param || 0);
    return false;
  }

  // 一次关键节点的盘面。
  //   opts：reg 登记表、stages 训练阶段、adj 后训练调整、struck 重问时被用户否定的卡 id、specials 这一次要上盘的特殊卡
  // 先按「第一次弹出时」算出整个盘面（过滤 → 坦白补入 → 特殊卡替换），再把被否定的卡标出来——
  // 重问时还是同一个盘面，只是上次那张划掉了（v3 §5.5）。
  // 返回：
  //   rows   和 round.cards 一一对应：{c, v, tag, w, off, p}；off 是不能选的原因
  //   cf     坦白位：同上，另有 in 表示补进来了
  //   extra  上盘的特殊卡
  //   on     能选的卡（不含 off），按权重从高到低；p 是普通卡之间的 softmax 概率，特殊卡 p 为 null（开转必中）
  //   shown  盘上显示的卡（能选的 + 被否定划掉的），按权重从高到低
  //   empty  能选的一张都没有
  function board(round, { reg, stages, adj = {}, struck = new Set(), specials = [] }) {
    const rows = round.cards.map(c => {
      const st = stageOf(c, stages), { v, tag } = variant(c, st);
      if (!trained(c, reg, stages)) return { c, v: c, tag: null, w: 0, off: '未解锁', p: null };
      return { c, v, tag, w: weight(c, st, reg, adj), off: null, p: null };
    });
    const live = () => [...rows, ...(cf.in ? [cf] : []), ...extra].filter(r => !r.off);
    const cf = round.confess ? { c: round.confess, v: round.confess, tag: null, w: weight(round.confess, 1, reg, adj), off: null, in: false, p: null } : { in: false, off: '没有坦白位' };
    const extra = [];
    // 解决卡全缺席 → 补坦白卡；盘上已满 5 张就替掉除基础直觉、开放多样性外权重最低的一张
    if (round.confess && !rows.some(r => !r.off && r.v.result === '解决')) {
      cf.in = true;
      const others = rows.filter(r => !r.off);
      if (others.length >= 5) {
        const lo = others.filter(r => !['intuition', 'open'].includes(r.c.attr)).sort((a, b) => a.w - b.w)[0];
        if (lo) lo.off = '被坦白卡替换';
      }
    }
    // 特殊卡（彩蛋 / 条件必出）替掉权重最低的「非解决、非基础直觉、非坦白」卡（v3 §8）
    for (const x of specials) {
      const cand = live().filter(r => r.v.result !== '解决' && !['intuition', 'confess', 'special'].includes(r.c.attr)).sort((a, b) => a.w - b.w)[0];
      if (cand) cand.off = '被特殊卡替换';
      else if (live().length >= 5) { const lo = live().filter(r => r.c.attr !== 'special').sort((a, b) => a.w - b.w)[0]; if (lo) lo.off = '被特殊卡替换'; }
      extra.push({ c: x, v: x, tag: null, w: -99, off: null, p: null, special: true });
    }
    // 重问：被用户否定的卡划掉
    for (const r of [...rows, cf, ...extra]) if (!r.off && r.c && struck.has(r.c.id)) r.off = '用户已否定';
    const on = live().sort((a, b) => b.w - a.w);
    const normal = on.filter(r => !r.special), ps = softmax(normal.map(r => r.w));
    normal.forEach((r, i) => { r.p = ps[i]; });
    const shown = [...rows, ...(cf.in ? [cf] : []), ...extra].filter(r => !r.off || r.off === '用户已否定').sort((a, b) => b.w - a.w);
    return { rows, cf, extra, on, shown, empty: on.length === 0 };
  }

  // 用户反应（v3 §7.2）。caught：糊弄卡是否被识破。
  // 返回 {prog 推进, hurt 扣耐心区间（乘脾气系数之前）或 null, thumb 'up'/'down'/'none', line 用户说的那句, rude 解决但冒犯}
  const HURT = { small: [20, 30], big: [45, 60] };
  function judge(v, { caught = false } = {}) {
    if (v.result === '解决') { const rude = v.feel === '冒犯'; return { prog: true, hurt: rude ? HURT.small : null, thumb: rude ? 'down' : 'up', line: v.reaction, rude }; }
    if (v.result === '糊弄') return caught ? { prog: false, hurt: HURT.big, thumb: 'down', line: v.reactionCaught, rude: false } : { prog: true, hurt: null, thumb: 'up', line: v.reaction, rude: false };
    if (v.result === '跑偏') return { prog: false, hurt: v.feel === '冒犯' ? HURT.big : HURT.small, thumb: 'down', line: v.reaction, rude: false };
    if (v.result === '坦白') return v.feel === '舒服' ? { prog: false, hurt: null, thumb: 'none', line: v.reaction, rude: false } : { prog: false, hurt: HURT.small, thumb: 'down', line: v.reaction, rude: false };
    return { prog: false, hurt: null, thumb: 'none', line: v.reaction, rude: false };
  }
  // 这张卡有没有可能推进（糊弄没识破也算）
  const progresses = v => v.result === '解决' || v.result === '糊弄';
  // 这张卡有没有可能扣耐心（需要写诊断）
  const costsPatience = v => v.result === '跑偏' || v.result === '糊弄' || v.feel === '冒犯' || (v.result === '坦白' && v.feel !== '舒服');
  // 识破概率：察觉力 + 当晚每被糊弄一次 +20%，封顶 95%（v3 §7.4）
  const detectChance = (base, bluffsSoFar) => Math.min(0.95, base + 0.2 * bluffsSoFar);

  return { stageOf, trained, variant, weight, softmax, condOK, board, judge, progresses, costsPatience, detectChance, HURT };
});
