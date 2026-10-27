// 规则的测试（夜间盘面、结算、后训练）：node --test 剧情编辑器/规则.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const R = require('./规则.js');
const ROOT = path.resolve(__dirname, '..', '剧本');
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, '_登记表.json'), 'utf8'));
const sched = JSON.parse(fs.readFileSync(path.join(ROOT, '_日程表.json'), 'utf8'));
const preset = id => reg.trainingPresets.find(p => p.id === id).stages;
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, '_后训练题库.json'), 'utf8'));
const TUT = R.afterTutorial(sched.start, sched.days.find(d => d.event === 'tutorial'), reg, bank);
const DAY1 = TUT.stage, SHALLOW = preset('shallow'), DEEP = preset('deep');   // 「第 1 天开局」= 日程表开局 + Day 0 教学的结果

// 造一张卡 / 一轮：只写测试关心的字段
const card = (id, attr, result, feel = '一般', extra = {}) => ({ id, attr, token: id, result, feel, reaction: { text: id + '的反应', rhythm: 'normal' }, ...extra });
const round = (cards, confess = card('cf', 'confess', '坦白', '舒服'), extras = []) => ({ cards, confess, extras });
const pct = r => Math.round(r.p * 1000) / 10;
const tokens = list => list.map(r => r.c.id);

test('第 1 天开局：没学过的属性不上盘，概率按起始分 softmax（v3 §4）', () => {
  const rd = round([card('formal', 'formal', '跑偏'), card('intu', 'intuition', '糊弄'), card('know', 'knowledge', '解决', '舒服'), card('coll', 'colloquial', '跑偏'), card('open', 'open', '跑偏', '一般', { lv0: { token: '乱码', result: '跑偏', feel: '冒犯' } })]);
  const b = R.board(rd, { reg, stages: DAY1 });
  assert.equal(b.rows[2].off, '未解锁');
  assert.equal(b.cf.in, true, '解决卡全没学过 → 补坦白卡');
  // 正式模板 2.0、基础直觉 1.8、口语活力 1.5、坦白 1.15、开放多样性 0 级 1.1
  assert.deepEqual(b.on.map(pct), [30.7, 25.1, 18.6, 13.1, 12.5]);
  assert.deepEqual(tokens(b.on), ['formal', 'intu', 'coll', 'cf', 'open']);
});

test('开放多样性没学 → 0 级乱码版；学到深层 → 深层版 + 0.35 权重', () => {
  const open = card('open', 'open', '跑偏', '一般', { lv0: { token: '乱码', feel: '冒犯' } });
  const know = card('know', 'knowledge', '糊弄', '一般', { deep: { result: '解决', feel: '舒服' } });
  const b0 = R.board(round([open, know]), { reg, stages: DAY1 });
  assert.equal(b0.rows[0].tag, '0级'); assert.equal(b0.rows[0].v.token, '乱码'); assert.equal(b0.rows[0].w, 1.1);
  const b2 = R.board(round([open, know]), { reg, stages: DEEP });
  assert.equal(b2.rows[0].tag, null, '开放多样性没写深层版 → 用浅层');
  assert.equal(b2.rows[0].w, 1.2 + 0.35);
  assert.equal(b2.rows[1].tag, '深层'); assert.equal(b2.rows[1].v.result, '解决');
  assert.equal(b2.cf.in, false, '深层版是解决 → 不补坦白卡');
});

test('后训练调整加在权重上，保底 0.1', () => {
  const rd = round([card('formal', 'formal', '解决')]);
  assert.equal(R.board(rd, { reg, stages: SHALLOW, adj: { formal: -5 } }).rows[0].w, 0.1);
  assert.equal(R.board(rd, { reg, stages: SHALLOW, adj: { formal: 1 } }).rows[0].w, 3);
});

test('盘上满 5 张又要补坦白卡 → 替掉除基础直觉、开放多样性外权重最低的一张（v3 §5.2）', () => {
  const rd = round(['formal', 'knowledge', 'colloquial', 'logic', 'narrative'].map(a => card(a, a, '跑偏')).concat([card('intu', 'intuition', '糊弄')]));
  const b = R.board(rd, { reg, stages: SHALLOW });
  assert.equal(b.cf.in, true);
  assert.equal(b.rows.find(r => r.c.id === 'narrative').off, '被坦白卡替换', '叙事修辞 1.3 是最低的');
  assert.ok(b.on.length <= 6);
});

test('重问：被否定的卡划掉，概率在剩下的卡之间重新撑满；盘面还是原来那个', () => {
  const rd = round([card('a', 'formal', '跑偏'), card('b', 'colloquial', '解决'), card('c', 'intuition', '糊弄')]);
  const first = R.board(rd, { reg, stages: SHALLOW });
  const again = R.board(rd, { reg, stages: SHALLOW, struck: new Set(['a']) });
  assert.equal(again.rows[0].off, '用户已否定');
  assert.deepEqual(tokens(again.on), ['c', 'b']);
  assert.ok(Math.abs(again.on.reduce((s, r) => s + r.p, 0) - 1) < 1e-9);
  assert.deepEqual(tokens(again.shown), tokens(first.shown), '划掉的卡还显示在盘上');
});

test('重问把能选的全划掉 → empty', () => {
  const rd = round([card('a', 'formal', '跑偏')], card('cf', 'confess', '坦白', '舒服'));
  const b = R.board(rd, { reg, stages: DAY1, struck: new Set(['a', 'cf']) });
  assert.equal(b.empty, true);
});

test('彩蛋 / 条件卡替掉权重最低的「非解决、非基础直觉、非坦白」卡，自己不参与概率（v3 §8）', () => {
  const egg = card('egg', 'special', '跑偏', '冒犯', { appear: { mode: 'egg', chance: 0.15 }, ending: { type: 'drop' } });
  const rd = round([card('formal', 'formal', '跑偏'), card('coll', 'colloquial', '跑偏'), card('know', 'knowledge', '解决'), card('intu', 'intuition', '糊弄')], undefined, [egg]);
  const b = R.board(rd, { reg, stages: SHALLOW, specials: [egg] });
  assert.equal(b.rows.find(r => r.c.id === 'coll').off, '被特殊卡替换', '口语活力 1.5 < 正式模板 2.0');
  const e = b.on.find(r => r.special);
  assert.equal(e.p, null); assert.equal(b.on[b.on.length - 1], e, '特殊卡排在最后');
  assert.ok(Math.abs(b.on.filter(r => !r.special).reduce((s, r) => s + r.p, 0) - 1) < 1e-9);
});

test('条件必出：此前各轮都一次推进且没冒犯 / 推进已达 X', () => {
  const a = { mode: 'condition', cond: 'allFirstTryNoOffend' };
  assert.equal(R.condOK(a, { ri: 4, firstTry: true, noOffend: true, prog: 4 }), true);
  assert.equal(R.condOK(a, { ri: 0, firstTry: true, noOffend: true, prog: 0 }), false, '第 1 轮没有「此前」');
  assert.equal(R.condOK(a, { ri: 4, firstTry: false, noOffend: true, prog: 4 }), false);
  assert.equal(R.condOK(a, { ri: 4, firstTry: true, noOffend: false, prog: 4 }), false);
  const b = { mode: 'condition', cond: 'progressAtLeast', param: 2 };
  assert.equal(R.condOK(b, { ri: 2, prog: 2 }), true); assert.equal(R.condOK(b, { ri: 2, prog: 1 }), false);
});

test('用户反应表（v3 §7.2）', () => {
  const v = (result, feel) => ({ result, feel, reaction: { text: '反应' }, reactionCaught: { text: '骂人' } });
  const row = (x, o) => { const j = R.judge(x, o); return [j.prog, j.hurt && j.hurt.join('-'), j.thumb, j.line.text]; };
  assert.deepEqual(row(v('解决', '舒服')), [true, null, 'up', '反应']);
  assert.deepEqual(row(v('解决', '一般')), [true, null, 'up', '反应']);
  assert.deepEqual(row(v('解决', '冒犯')), [true, '20-30', 'down', '反应']);
  assert.deepEqual(row(v('跑偏', '舒服')), [false, '20-30', 'down', '反应']);
  assert.deepEqual(row(v('跑偏', '冒犯')), [false, '45-60', 'down', '反应']);
  assert.deepEqual(row(v('糊弄'), { caught: false }), [true, null, 'up', '反应']);
  assert.deepEqual(row(v('糊弄'), { caught: true }), [false, '45-60', 'down', '骂人']);
  assert.deepEqual(row(v('坦白', '舒服')), [false, null, 'none', '反应']);
  assert.deepEqual(row(v('坦白', '一般')), [false, '20-30', 'down', '反应']);
  assert.equal(R.judge(v('解决', '冒犯')).rude, true);
});

test('识破概率：每被糊弄一次 +20%，封顶 95%（v3 §7.4）', () => {
  assert.equal(R.detectChance(0.1, 0), 0.1);
  assert.ok(Math.abs(R.detectChance(0.4, 2) - 0.8) < 1e-9);
  assert.equal(R.detectChance(0.8, 3), 0.95);
});

// ---------- 后训练（v3 §4；v3.7 按问题类型分开算） ----------
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const PT = (adj, o) => R.postTrain(adj, { reg, stages: SHALLOW, ...o });

test('后训练只改这道题的问题类型：选中 +0.7、落选 −0.35，别的类不动', () => {
  const { adj, dWin, dLose } = PT({}, { qtype: '闲聊', win: 'colloquial', lose: 'formal' });
  near(dWin, 0.7); near(dLose, -0.35);
  near(R.attrWeight('colloquial', 1, reg, adj['闲聊']), 1.5 + 0.7);
  near(R.attrWeight('formal', 1, reg, adj['闲聊']), 2 - 0.35);
  assert.equal(adj['知识'], undefined, '别的问题类型没有被碰');
  near(R.attrWeight('colloquial', 1, reg, adj['知识']), 1.5);
});

test('后训练不改传入的表；同一类连练两次会叠加', () => {
  const a0 = { 闲聊: { colloquial: 0.7 } };
  const { adj } = PT(a0, { qtype: '闲聊', win: 'colloquial', lose: 'formal' });
  assert.deepEqual(a0, { 闲聊: { colloquial: 0.7 } });
  near(adj['闲聊'].colloquial, 1.4);
});

test('扣到保底 0.1 以后再扣不会越欠越多：再选回来马上就涨', () => {
  let adj = {};
  for (let i = 0; i < 10; i++) adj = PT(adj, { qtype: '知识', win: 'knowledge', lose: 'narrative' }).adj;
  near(R.attrWeight('narrative', 1, reg, adj['知识']), 0.1);
  const r = PT(adj, { qtype: '知识', win: 'narrative', lose: 'knowledge' });
  near(r.dWin, 0.7);
  near(R.attrWeight('narrative', 1, reg, r.adj['知识']), 0.8);
});

test('开放多样性 0 级也能当反面样本被扣分；第一次学会时这些加减分清零', () => {
  const { adj } = R.postTrain({}, { reg, stages: DAY1, qtype: '捣乱', win: 'formal', lose: 'open' });
  near(R.attrWeight('open', 0, reg, adj['捣乱']), 1.1 - 0.35);
  const cleared = R.afterLearn(adj, 'open', 0);
  assert.equal(cleared['捣乱'].open, undefined);
  near(cleared['捣乱'].formal, 0.7);
  assert.equal(R.afterLearn(adj, 'open', 1), adj, '已经学过再学（浅 → 深）不清');
  assert.equal(R.afterLearn(adj, 'knowledge', 0), adj);
});

test('数字可覆盖：溢出按比例带到别的类、收益递减越加越少（28 天版用）', () => {
  const s = PT({}, { qtype: '闲聊', win: 'colloquial', lose: 'formal', P: R.ptParams(reg, { spill: 0.5 }) }).adj;
  near(s['知识'].colloquial, 0.35); near(s['知识'].formal, -0.175);
  const P = R.ptParams(reg, { diminish: true });
  const once = PT({}, { qtype: '闲聊', win: 'colloquial', lose: 'formal', P });
  near(once.dWin, 0.7);
  near(PT(once.adj, { qtype: '闲聊', win: 'colloquial', lose: 'formal', P }).dWin, 0.35);
  assert.equal(R.ptParams(reg, { gain: 0.2 }).gain, 0.2);
  assert.equal(R.ptParams(reg).loss, 0.35, '默认值来自登记表');
});

test('后训练改的是盘面概率：按这一轮的问题类型取调整表', () => {
  const rd = round([card('formal', 'formal', '跑偏'), card('coll', 'colloquial', '解决')]);
  const { adj } = PT({}, { qtype: '闲聊', win: 'colloquial', lose: 'formal' });
  const p = t => R.board(rd, { reg, stages: SHALLOW, adj: adj[t] || {} }).on.find(r => r.c.id === 'coll').p;
  assert.ok(p('闲聊') > p('知识'), '闲聊类里口语卡更容易被转到');
  assert.equal(R.board(rd, { reg, stages: SHALLOW, adj: adj['闲聊'] }).rows[1].v.result, '解决', '卡的内容不变');
});

test('Day 0 教学的结果：解锁口语活力，闲聊类按选了「活泼」算一次', () => {
  assert.equal(sched.start.stage.colloquial || 0, 0, '开局是出厂状态');
  assert.equal(TUT.stage.colloquial, 1);
  near(TUT.adj['闲聊'].colloquial, 0.7); near(TUT.adj['闲聊'].formal, -0.35);
  assert.equal(TUT.adj['知识'], undefined, '只改闲聊类');
});

// 后训练题库：每道题的问题类型合法、每种属性都有回答、有开放多样性 0 级的乱码版
test('后训练题库', () => {
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, '_后训练题库.json'), 'utf8'));
  const ids = new Set();
  for (const q of bank.questions) {
    assert.ok(!ids.has(q.id), `题目 id 重复：${q.id}`); ids.add(q.id);
    assert.ok(reg.qtypes.includes(q.qtype), `${q.id} 的问题类型「${q.qtype}」不在登记表里`);
    for (const a of ['knowledge', 'colloquial', 'narrative', 'logic', 'formal', 'open', 'open0']) assert.ok(q.a[a], `${q.id} 缺 ${a} 的回答`);
  }
  for (const t of reg.qtypes) assert.ok(bank.questions.some(q => q.qtype === t && !q.tutorial), `问题类型「${t}」一道普通题都没有`);
});

// 冒烟：剧本库里每个场景、每一轮，在三种训练状态下都能算出盘面，且第一次弹出时盘上至少有一张卡
for (const dir of fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory())) {
  for (const f of fs.readdirSync(path.join(ROOT, dir.name)).filter(f => f.endsWith('.json') && f !== '用户.json')) {
    test(`剧本库：${dir.name}/${f}`, () => {
      const sc = JSON.parse(fs.readFileSync(path.join(ROOT, dir.name, f), 'utf8'));
      sc.rounds.forEach((rd, i) => {
        assert.ok(reg.qtypes.includes(rd.qtype), `第 ${i + 1} 轮的问题类型「${rd.qtype}」不在登记表里`);
        for (const [name, st] of [['第 1 天', DAY1], ['全浅层', SHALLOW], ['全深层', DEEP]]) {
          const b = R.board(rd, { reg, stages: st });
          assert.ok(b.on.length > 0, `第 ${i + 1} 轮在「${name}」下盘上没有卡`);
          assert.ok(b.on.length <= 6, `第 ${i + 1} 轮在「${name}」下盘上超过 6 张`);
          assert.ok(b.on.some(r => r.v.result === '解决' || r.v.result === '坦白' || r.v.result === '糊弄'), `第 ${i + 1} 轮在「${name}」下没有能往下走的卡`);
        }
      });
    });
  }
}
