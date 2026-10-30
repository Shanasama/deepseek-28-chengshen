// 编辑器的「后训练」模块（文档/阶段/对口属性与题库_阶段进度.md）：问题类型总表 + 后训练题库。
// 和另外两个模块共用 index.html 的一切：画布、原地编辑 ed()、存盘（docs / SAVED / flush）、撤销、校验面板；剧情模块.js 的 setMod / hd / check 也直接用。
// index.html 的 renderTop / renderSide / renderLane / drawEdges / renderPanel / validate / select / focusTarget / openHelp 看到 S.mod==='train' 就转到这里。
// 两个画面（S.tmode）：'types' 问题类型总表（对口属性、全库的反例轮、推荐上限）/ 某个问题类型或 '教学'：这一类的题，一道题一列。

const BANKP = '_后训练题库.json', REGP = '_登记表.json';
const QA = ['knowledge', 'colloquial', 'narrative', 'logic', 'formal', 'open', 'open0'];   // 一道题的 7 段回答（open0 是开放多样性没学时的乱码版）
const MARKS = ['好', '一般', '坏'];
const QPRE = { 闲聊: 'chat', 知识: 'know', 捣乱: 'trol', 情感倾诉: 'emo', 代码求助: 'code', 写作: 'write' };   // 新题的编号前缀
S.tmode = 'types'; S.train = null;
const qOf = id => (S.bank?.questions || []).find(q => q.id === id);
const qsOf = t => (S.bank?.questions || []).filter(q => t === '教学' ? q.tutorial : q.qtype === t && !q.tutorial);
const qaName = a => a === 'open0' ? '开放多样性 · 0 级' : regAttr(a)?.name || a;
const qaCol = a => COL[a === 'open0' ? 'open' : a];
const dkAttr = t => RULES.duikouCfg(S.reg).map[t] || null;
const tmodeOf = q => q.tutorial ? '教学' : q.qtype;

// ---------- 载入 / 存盘（接进 index.html 的 docs() 和撤销） ----------
// 每次进模块都把全库场景读一遍（只读，算对口统计用）；题库和登记表在这里改，存回去
async function loadTrain() {
  if (!S.bank) S.bank = { version: 1, questions: [] };
  const scenes = [];
  for (const u of S.list) for (const s of u.scenes) {
    try { scenes.push({ user: u.dir, name: u.user.name, file: s.file, title: s.title, tutorial: !!u.user.tutorial, scene: await (await fetch(`/剧本/${u.dir}/${s.file}?t=${Date.now()}`)).json() }); } catch { }
  }
  if (!S.train) { SAVED[BANKP] = ser(S.bank); SAVED[REGP] = ser(S.reg); }
  S.train = { scenes };
}
const trainDocs = () => S.train ? [[BANKP, S.bank], [REGP, S.reg]] : [];
const trainSnap = () => S.train ? ser({ b: S.bank, d: S.reg.duikou }) : '';
function trainRestore(t) { if (!t) return; const o = JSON.parse(t); S.bank = o.b; S.reg.duikou = o.d; if (S.sel?.q && !qOf(S.sel.q)) S.sel = null; }

// ---------- 顶栏 / 切换画面 ----------
function trainTop() {
  $('#crumb').replaceChildren(h('span', {}, '后训练 / '), h('b', {}, S.tmode === 'types' ? '问题类型' : S.tmode === '教学' ? '教学题' : S.tmode + '类'));
  $('#ts').replaceChildren();
}
function trainGo(m) { S.tmode = m; S.sel = null; V.x = 0; V.y = 0; V.z = 1; applyView(); S.enter = true; renderAll(); panelIn(); }
// select() 进来时：点的是别的类的题，先切到那一类
function trainRoute(t) {
  if (!t) return; const q = t.q && qOf(t.q);
  if (q && S.tmode !== tmodeOf(q)) { S.tmode = tmodeOf(q); S.enter = true; }
  if (t.kind === 'qt' || t.kind === 'tcap') S.tmode = 'types';
}

// ---------- 左栏：问题类型总表，下面按问题类型分组列出题库 ----------
function trainSide() {
  const box = $('#sside');
  if (!box.querySelector('#tslist')) box.replaceChildren(h('div', { class: 'sstop' }), h('input', { class: 'sfind', type: 'search', placeholder: '🔍 搜题目', oninput: e => { S.tfind = e.target.value.trim(); trainSideList(); } }), h('div', { id: 'tslist' }));
  box.querySelector('.sstop').replaceChildren(h('h6', {}, '后训练'),
    h('div', { class: 'scene' + (S.tmode === 'types' ? ' on' : ''), title: '6 类问题的对口属性、全库有几轮反例、推荐上限', onclick: () => trainGo('types') }, h('span', { class: 'o' }, '🧭'), '问题类型'),
    h('div', { class: 'sgh' }, h('h6', {}, `后训练题库 · ${(S.bank?.questions || []).length}`),
      h('span', {}, h('button', { title: '在当前这一类里加一道题', onclick: () => newQ(S.tmode) }, '＋ 新题'))));
  trainSideList();
}
function trainSideList() {
  const box = $('#tslist'); if (!box) return; box.replaceChildren();
  const f = (S.tfind || '').toLowerCase(), per = RULES.ptParams(S.reg).perBatch;
  for (const t of [...(S.reg.qtypes || []), '教学']) {
    const all = qsOf(t), list = f ? all.filter(q => (q.q + ' ' + q.id).toLowerCase().includes(f)) : all;
    if (f && !list.length) continue;
    const open = !!f || S.tmode === t, a = dkAttr(t), few = t !== '教学' && all.length < per;
    box.append(h('div', { class: 'sgg' + (open ? ' open' : ''), title: (t === '教学' ? 'Day 0 出厂测试用的题' : t + '类') + ' · 点开看这一类的题', onclick: () => trainGo(t) },
      h('span', { class: 'ar' }, open ? '▾' : '▸'), t === '教学' ? '教学题' : t + '类', a ? h('span', { class: 'sgd', style: `color:${COL[a]}` }, '对口 ' + regAttr(a).name) : null,
      h('i', { style: few ? 'color:#ff9aa1' : '', title: few ? `不到 ${per} 道：一次后训练要 ${per} 道` : '' }, all.length)));
    if (!open) continue;
    for (const q of list) box.append(h('div', { class: 'scene sg' + (q.id === S.sel?.q ? ' on' : ''), title: q.q, onclick: () => { select({ kind: 'tq', q: q.id }); focusTarget({ kind: 'tq', q: q.id }); } },
      h('span', { class: 'sgn' }, q.q || '（还没写问题）'), issueDot({ kind: 'tq', q: q.id })));
  }
}

// ---------- 画布 ----------
function trainCanvas() {
  const lane = $('#laneIn'); lane.replaceChildren(); ISSUES = validate(); renderValidBtn();
  $('#legend').replaceChildren(h('span', { style: 'cursor:pointer;color:var(--lgold)', onclick: openHelp }, '？ 后训练模块怎么用'));
  tryBox();
  if (S.tmode === 'types') return typesCanvas(lane);
  bankCanvas(lane);
}
const atag = (a, pre = '') => { const c = COL[a]; return h('span', { class: 'atag', style: `color:${c};background:${c}22` }, pre + regAttr(a).name); };
// 问题类型总表：一类一列，列头是对口属性和统计，下面是全库里这一类的反例轮、缺对口卡的轮（点了去夜间剧本打开）
function typesCanvas(lane) {
  const st = RULES.duikouStats(S.train.scenes, S.reg), cfg = RULES.duikouCfg(S.reg);
  lane.append(h('div', { class: 'sghd nopan' }, h('div', { class: 'sgt' }, h('b', {}, '问题类型'), h('span', { class: 'tag' }, '对口属性只给写剧本的人看，游戏里不显示')),
    h('div', { class: 'shbtns' }, h('button', { class: 'mini', title: '推荐值：超了只提醒，不拦', onclick: () => select({ kind: 'tcap' }) }, `⚙ 推荐上限：每场 ≤ ${cfg.perScene} 轮反例 · 每类 ≤ ${Math.round(cfg.ratio * 100)}%`))));
  const row = h('div', { class: 'trow' }); lane.append(row);
  for (const t of S.reg.qtypes || []) {
    const s = st[t], a = s.attr, pct = s.n ? s.counter.length / s.n : 0, c = h('div', { class: 'col' + (S.enter ? ' enter' : '') });
    c.append(h('div', { class: 'colhd' + (S.sel?.kind === 'qt' && S.sel.t === t ? ' sel' : ''), 'data-t': t, onclick: () => select({ kind: 'qt', t }) },
      h('div', { class: 'no' }, h('b', {}, t + '类 ', issueDot({ kind: 'qt', t })), a ? atag(a, '对口 · ') : h('span', { class: 'atag', style: 'color:#ff9aa1' }, '没登记对口属性')),
      h('div', { class: 'tstat' }, `剧本里 ${s.n} 轮 · 反例 ${s.counter.length} 轮`, s.missing.length ? h('span', { class: 'bad' }, ` · 缺对口卡 ${s.missing.length} 轮`) : null),
      h('div', { class: 'tbar', title: `反例占 ${Math.round(pct * 100)}%，推荐不超过 ${Math.round(cfg.ratio * 100)}%（竖线）` }, h('i', { style: `width:${Math.min(100, pct * 100)}%;background:${s.over ? '#ff9aa1' : 'var(--lgold)'}` }), h('b', { style: `left:${Math.min(100, cfg.ratio * 100)}%` })),
      h('div', { class: 'tstat' }, h('a', { onclick: e => { e.stopPropagation(); trainGo(t); } }, `后训练题 ${qsOf(t).length} 道 →`))));
    for (const e of s.missing) c.append(roundCard(e, '缺对口卡', true));
    for (const e of s.counter) c.append(roundCard(e, e.note || '还没写反例理由', !e.note));
    if (!s.missing.length && !s.counter.length) c.append(h('div', { class: 'note', style: 'padding:6px 4px' }, s.n ? '没有反例轮' : '剧本里还没有这一类的轮'));
    row.append(c);
  }
}
function roundCard(e, txt, bad) {
  const sc = S.train.scenes.find(x => x.user === e.user && x.file === e.file);
  return h('div', { class: 'card tround', title: '点一下去夜间剧本里打开这一轮', onclick: () => jumpRound(e) }, h('div', { class: 'bar', style: `background:${bad ? '#ff9aa1' : 'var(--lgold)'}` }),
    h('div', { class: 'bd' }, h('div', { class: 'l0' }, h('b', {}, `${sc?.name || e.user} · ${sc?.title || e.file}`), h('span', { class: 'go' }, `第 ${e.ri + 1} 轮 →`)), h('div', { class: 'tnote' + (bad ? ' bad' : '') }, txt)));
}
async function jumpRound(e) { await setMod('night'); await openScene(e.user, e.file); select({ kind: 'round', ri: e.ri }); focusTarget({ kind: 'round', ri: e.ri }); }

// 一类的题：一道题一列，列头是问题，下面 7 段回答；对口属性那段带金色「对口」，好坏标记在右上角
function bankCanvas(lane) {
  const t = S.tmode, qs = qsOf(t), a0 = dkAttr(t);
  lane.append(h('div', { class: 'sghd nopan' }, h('div', { class: 'sgt' }, h('b', {}, t === '教学' ? '教学题' : t + '类 · 后训练题'), a0 ? atag(a0, '对口 · ') : null,
    h('span', { class: 'tag' }, t === '教学' ? 'Day 0 出厂测试用，两段回答固定配对' : `${qs.length} 道 · 一次后训练出 ${RULES.ptParams(S.reg).perBatch} 道`)),
    h('div', { class: 'shbtns' }, t !== '教学' ? h('button', { class: 'mini', onclick: () => newQ(t) }, '＋ 新题') : null)));
  const row = h('div', { class: 'trow' }); lane.append(row);
  for (const q of qs) row.append(qCol(q));
  if (t !== '教学') row.append(h('div', { class: 'col' }, h('div', { class: 'empty', onclick: () => newQ(t) }, '＋ 新题')));
}
function qCol(q) {
  const dk = dkAttr(q.qtype), c = h('div', { class: 'col' + (S.enter ? ' enter' : '') + (q.tutorial ? ' tut' : '') });
  c.append(h('div', { class: 'colhd' + (S.sel?.kind === 'tq' && S.sel.q === q.id ? ' sel' : ''), 'data-q': q.id, onclick: () => select({ kind: 'tq', q: q.id }) },
    h('div', { class: 'no' }, h('b', {}, q.id + ' ', issueDot({ kind: 'tq', q: q.id })), h('span', {}, h('span', { class: 'qt' }, q.qtype), q.tutorial ? ' · 教学' : '')),
    h('div', { class: 'bubble' }, q.q || '（还没写问题）')));
  for (const a of QA) {
    const sel = S.sel?.kind === 'tqa' && S.sel.q === q.id && S.sel.a === a, m = q.marks?.[a], col = qaCol(a), inPair = q.pair?.includes(a);
    c.append(h('div', { class: 'card tqa' + (sel ? ' sel' : '') + (q.pair && !inPair ? ' dim' : ''), 'data-q': q.id, 'data-a': a, onclick: () => select({ kind: 'tqa', q: q.id, a }) },
      h('div', { class: 'bar', style: `background:${col}` }),
      h('div', { class: 'bd' },
        h('div', { class: 'l0' }, h('span', { style: 'display:flex;gap:4px;align-items:center' }, h('span', { class: 'atag', style: `color:${col};background:${col}22` }, qaName(a)),
          a === dk ? h('span', { class: 'dkb', title: '这一类的对口属性：这段回答必须是好的' }, '对口') : null, inPair ? h('span', { class: 'badge' }, '教学配对') : null, issueDot({ kind: 'tqa', q: q.id, a })),
          h('span', { class: 'badge mk' + (m ? ' m-' + m : ''), title: '好坏标记：只给写剧本的人看，游戏不读' }, m || '未标')),
        h('div', { class: 'tqt' }, q.a?.[a] || h('span', { class: 'note' }, '（还没写）')))));
  }
  return c;
}

// ---------- 在游戏里试做：画布外面右下角一个小窗（不跟着画布重画，免得每打一个字游戏就重新载入） ----------
const TRY = { ready: false, q: null, pair: null, min: false };
let TRYBOX = null;
function tryBox() {
  if (!TRYBOX) {
    const frame = h('iframe', { class: 'tgame', src: '/游戏/?后训练预览=1', title: '在游戏里试做' });
    addEventListener('message', e => { if (e.source === frame.contentWindow && e.data?.type === '后训练就绪') TRY.ready = true; });
    TRYBOX = h('div', { class: 'trybox nopan' }, h('div', { class: 'trybar' }), h('div', { class: 'tgwrap' }, frame));
    $('#lane').append(TRYBOX);
  }
  const on = S.mod === 'train' && S.tmode !== 'types';
  TRYBOX.style.display = on ? '' : 'none'; if (!on) return;
  TRYBOX.classList.toggle('min', TRY.min);
  const k = Math.max(.3, Math.min(.6, ($('#lane').clientWidth - 24) / 768));   // 画布窄（右栏开着、窗口小）就缩小一点
  TRYBOX.querySelector('.tgwrap').style.cssText = `width:${Math.round(768 * k)}px;height:${Math.round(432 * k)}px`; TRYBOX.querySelector('.tgame').style.transform = `scale(${k})`; TRYBOX.style.width = Math.round(768 * k) + 'px';
  const q = qOf(S.sel?.q) || qsOf(S.tmode)[0], bar = TRYBOX.querySelector('.trybar');
  if (q && TRY.q !== q.id) { TRY.q = q.id; const dk = dkAttr(q.qtype) || 'knowledge'; TRY.pair = q.pair ? [...q.pair] : [dk, dk === 'formal' ? 'colloquial' : 'formal']; }
  const pick = k => { const s = h('select', { class: 'chipsel' }, ...QA.map(a => h('option', { value: a }, qaName(a)))); s.value = TRY.pair?.[k] || QA[k]; s.onchange = () => { TRY.pair[k] = s.value; }; return s; };
  bar.replaceChildren(h('b', {}, '🎮 在游戏里试做'), q ? h('span', { class: 'note' }, q.id) : h('span', { class: 'note' }, '这一类还没有题'),
    ...(q && !TRY.min ? [pick(0), h('span', { class: 'note' }, 'vs'), pick(1), h('button', { class: 'mini', onclick: () => tryQ(q) }, '▶ 试做这道题')] : []),
    h('span', { class: 'sp' }), h('button', { class: 'mini', title: TRY.min ? '展开' : '收起', onclick: () => { TRY.min = !TRY.min; tryBox(); } }, TRY.min ? '▴' : '▾'));
}
function tryQ(q) {
  if (!TRY.ready) return toast('游戏预览还在载入，等一下再点');
  const pair = TRY.pair.map(a => a === 'open0' ? 'open' : a);
  if (pair[0] === pair[1]) return toast('两段回答要是不同的属性');
  TRYBOX.querySelector('iframe').contentWindow.postMessage({ type: '试做', q: JSON.parse(JSON.stringify(q)), pair, stages: TRY.pair.includes('open0') ? { open: 0 } : {} }, location.origin);
}

// ---------- 新建 / 复制 / 删除 ----------
function newQ(t) {
  if (!t || t === 'types' || t === '教学') t = (S.reg.qtypes || [])[0];
  const pre = QPRE[t] || 'q', qs = S.bank.questions, n = Math.max(0, ...qs.filter(q => q.id.startsWith(pre + '-')).map(q => parseInt(q.id.slice(pre.length + 1)) || 0)) + 1;
  const q = { id: `${pre}-${n}`, qtype: t, q: '', a: Object.fromEntries(QA.map(a => [a, ''])) };
  insertQ(q); changed(); trainGo(t); select({ kind: 'tq', q: q.id }); toast(`已新建 ${q.id}，在右边写问题，再点每段回答写内容`);
}
// 插在同一类最后一道后面，文件里同类的题挨在一起
function insertQ(q) { const qs = S.bank.questions, i = qs.map(x => x.qtype === q.qtype && !x.tutorial).lastIndexOf(true); qs.splice(i < 0 ? qs.length : i + 1, 0, q); }
function dupQ(q) {
  const pre = QPRE[q.qtype] || 'q', n = Math.max(0, ...S.bank.questions.filter(x => x.id.startsWith(pre + '-')).map(x => parseInt(x.id.slice(pre.length + 1)) || 0)) + 1;
  const c = JSON.parse(JSON.stringify(q)); c.id = `${pre}-${n}`; delete c.tutorial; delete c.pair; insertQ(c); changed(); select({ kind: 'tq', q: c.id }); toast('已复制成 ' + c.id);
}
async function delQ(q) {
  if (!await confirmBox(`删除 ${q.id}？`, [q.q || '（还没写问题）', '删错了可以撤销。'], '删除')) return;
  S.bank.questions.splice(S.bank.questions.indexOf(q), 1); S.sel = null; changed(); renderAll(); toast('已删除 ' + q.id);
}

// ---------- 右栏 ----------
function trainPanel(P) {
  const s = S.sel; if (!s) return;
  if (s.kind === 'qt') return qtPanel(P);
  if (s.kind === 'tcap') return capPanel(P);
  if (s.kind === 'tq') return qPanel(P);
  if (s.kind === 'tqa') return qaPanel(P);
}
const DKATTRS = () => S.reg.attrs.filter(a => !['intuition', 'confess', 'special'].includes(a.id));
function qtPanel(P) {
  const t = S.sel.t, s = RULES.duikouStats(S.train.scenes, S.reg)[t];
  P.append(hd(t + '类', '问题类型 · 对口属性存在 剧本/_登记表.json', '问题类型'));
  const F = h('div', { class: 'form' }); P.append(F);
  const sel = h('select', {}, h('option', { value: '' }, '（不登记）'), ...DKATTRS().map(a => h('option', { value: a.id }, a.name))); sel.value = dkAttr(t) || '';
  sel.onchange = () => { const d = S.reg.duikou || (S.reg.duikou = { map: {} }); d.map = d.map || {}; if (sel.value) d.map[t] = sel.value; else delete d.map[t]; changed(); renderPanel(); };
  F.append(field('对口属性', sel, '这一类问题大多数轮里能解决的那个属性。改了以后，全库每一轮都按新的对口属性检查'));
  F.append(h('div', { class: 'note' }, `剧本里这一类有 ${s.n} 轮，反例 ${s.counter.length} 轮${s.missing.length ? `，缺对口卡 ${s.missing.length} 轮` : ''}。每一轮都要写对口属性的卡；它浅层不解决的就是反例轮，要在那一轮写反例理由（为什么不行、台词里哪句是线索）。`));
  P.append(acts(['看这一类的后训练题 →', () => trainGo(t)]));
}
function capPanel(P) {
  const d = S.reg.duikou || (S.reg.duikou = { map: {} }), cfg = RULES.duikouCfg(S.reg);
  P.append(hd('推荐上限', '只是推荐值：超了编辑器只提醒，不拦 · 剧本/_登记表.json', '推荐上限'));
  const F = h('div', { class: 'form' }); P.append(F);
  const ps = h('input', { type: 'number', min: 0, step: 1 }); ps.value = cfg.perScene; ps.oninput = () => { const v = parseInt(ps.value); if (!isNaN(v)) { d.perScene = v; changed(); } };
  const ra = h('input', { type: 'number', min: 0, max: 100, step: 1 }); ra.value = Math.round(cfg.ratio * 100); ra.oninput = () => { const v = parseFloat(ra.value); if (!isNaN(v)) { d.ratio = v / 100; changed(); } };
  F.append(field('每个场景最多几轮反例', ps), field('每个问题类型的反例最多占几成（%）', ra, '按全库这一类的轮数算'));
}
function qPanel(P) {
  const q = qOf(S.sel.q); if (!q) { S.sel = null; return; }
  P.append(hd(q.id, `${q.qtype}类${q.tutorial ? ' · 教学题' : ''} · 剧本/${BANKP}`, '题目'));
  const F = h('div', { class: 'form' }); P.append(F);
  F.append(field('问题', ed({ ...fieldIO(q, 'q'), label: '问题', ph: '用户问的那句话' })));
  const qt = h('select', {}, ...(S.reg.qtypes || []).map(t => h('option', { value: t }, t))); qt.value = q.qtype;
  qt.onchange = () => { q.qtype = qt.value; changed(); select({ kind: 'tq', q: q.id }); };
  F.append(field('问题类型', qt, '换了类，这道题就挪到那一类里'));
  if (q.tutorial) {
    const pr = k => { const s = h('select', {}, ...QA.filter(a => a !== 'open0').map(a => h('option', { value: a }, qaName(a)))); s.value = q.pair?.[k] || ''; s.onchange = () => { q.pair = q.pair || []; q.pair[k] = s.value; changed(); }; return s; };
    F.append(field('教学配对（第一个算「选对的」）', h('div', { style: 'display:flex;gap:6px;align-items:center' }, pr(0), 'vs', pr(1)), 'Day 0 出厂测试固定出这一对；跳过教学时按选了第一个算'));
  }
  const marked = QA.filter(a => q.marks?.[a]).length;
  F.append(h('div', { class: 'note' }, `点画布上的每段回答改内容、标好坏（已标 ${marked}/${QA.length}）。对口属性那段必须标「好」，六个属性里至少一段标「坏」（乱码版不算），成对回答才有反差。`));
  P.append(acts(['▶ 在游戏里试做', () => { TRY.min = false; tryBox(); tryQ(q); }], ['复制一道', () => dupQ(q)], ['删除这道题', () => delQ(q), true, '删错了可以撤销']));
}
function qaPanel(P) {
  const q = qOf(S.sel.q), a = S.sel.a; if (!q) { S.sel = null; return; }
  const dk = dkAttr(q.qtype), i = QA.indexOf(a);
  P.append(hd(qaName(a), `${q.id} · ${q.qtype}类 · ${q.q || '（还没写问题）'}`, '回答'));
  const F = h('div', { class: 'form' }); P.append(F);
  if (a === dk) F.append(h('div', { class: 'phint warn' }, h('b', {}, '对口属性'), '这一类的对口属性：这段必须是好的回答（题库里不放反例，反例留给夜里）。'));
  if (a === 'open0') F.append(h('div', { class: 'note' }, '开放多样性还没学时，成对回答里它显示这段乱码。乱码要和题目的字搅在一起。'));
  q.a = q.a || {};
  const box = ed({ ...fieldIO(q.a, a), label: '回答', ph: '30 字左右；这个属性的口吻一眼能认出来' });
  F.append(field('回答', box, `${hanLen(q.a[a])} 个字（标点不算），30 字左右`));
  const mk = h('div', { class: 'mkrow' }, ...[...MARKS, ''].map(m => h('button', { class: 'mini mk' + (m ? ' m-' + m : '') + ((q.marks?.[a] || '') === m ? ' on' : ''), onclick: () => { q.marks = q.marks || {}; if (m) q.marks[a] = m; else delete q.marks[a]; if (!Object.keys(q.marks).length) delete q.marks; changed(); renderPanel(); } }, m || '不标')));
  F.append(field('好坏标记', mk, '只给写剧本的人看，游戏不读：玩家选哪段就训哪段'));
  P.append(acts(i > 0 && ['← 上一段', () => select({ kind: 'tqa', q: q.id, a: QA[i - 1] })], i < QA.length - 1 && ['下一段 →', () => select({ kind: 'tqa', q: q.id, a: QA[i + 1] })]));
}

// ---------- 校验 ----------
function validateTrain() {
  const out = [], R = S.reg, add = (lv, msg, target) => { if (!out.some(o => o.msg === msg)) out.push({ lv, msg, target }); };
  const per = RULES.ptParams(R).perBatch, ids = new Set();
  for (const q of S.bank?.questions || []) {
    const n = `「${q.id || q.q}」`, T = { kind: 'tq', q: q.id }, dk = dkAttr(q.qtype);
    if (ids.has(q.id)) add('err', n + '：题目编号重复', T); ids.add(q.id);
    if (!(R.qtypes || []).includes(q.qtype)) add('err', n + `：问题类型「${q.qtype}」不在登记表里`, T);
    if (!q.q) add('err', n + '：问题是空的', T);
    for (const a of QA.filter(x => x !== 'open0')) if (!q.a?.[a]) add('err', n + `：缺「${qaName(a)}」的回答`, { kind: 'tqa', q: q.id, a });
    if (!q.a?.open0) add('warn', n + '：缺开放多样性 0 级的乱码版（游戏里会临时生成乱码）', { kind: 'tqa', q: q.id, a: 'open0' });
    for (const a of QA) if (hanLen(q.a?.[a]) > 45) add('info', n + `：「${qaName(a)}」${hanLen(q.a[a])} 个字，比 30 字左右长不少`, { kind: 'tqa', q: q.id, a });
    if (dk) {
      const m = q.marks?.[dk];
      if (m && m !== '好') add('err', n + `：对口属性「${qaName(dk)}」那段标成了「${m}」，题库里对口属性必须是好的回答`, { kind: 'tqa', q: q.id, a: dk });
      else if (!m) add('warn', n + `：对口属性「${qaName(dk)}」那段还没标好坏`, { kind: 'tqa', q: q.id, a: dk });
    }
    if (q.marks && !QA.some(a => a !== 'open0' && q.marks[a] === '坏')) add('warn', n + '：六个属性里没有一段标「坏」（乱码版不算），成对回答缺反差', T);
    if (q.tutorial && (!q.pair || q.pair.length !== 2 || q.pair[0] === q.pair[1])) add('err', n + '：教学题要固定配对两个不同的属性', T);
  }
  for (const t of R.qtypes || []) {
    const k = qsOf(t).length, T = { kind: 'qt', t };
    if (!k) add('err', `后训练题库：「${t}」类一道普通题都没有`, T); else if (k < per) add('info', `后训练题库：「${t}」类只有 ${k} 道普通题，一次后训练要 ${per} 道`, T);
    if (!dkAttr(t)) add('warn', `「${t}」类没登记对口属性`, T);
  }
  const st = RULES.duikouStats(S.train?.scenes || [], R), cfg = RULES.duikouCfg(R);
  for (const [t, s] of Object.entries(st)) {
    const T = { kind: 'qt', t };
    if (s.missing.length) add('warn', `${t}类：剧本里有 ${s.missing.length} 轮缺对口卡（去夜间剧本补）`, T);
    if (s.counter.some(e => !e.note)) add('warn', `${t}类：有 ${s.counter.filter(e => !e.note).length} 轮反例没写理由（去夜间剧本补）`, T);
    if (s.over) add('warn', `${t}类：反例 ${s.counter.length}/${s.n} 轮，超过推荐的 ${Math.round(cfg.ratio * 100)}%（只是推荐值）`, T);
  }
  return out;
}
function trainFocus(t) {
  const el = t.kind === 'tq' ? $(`.colhd[data-q="${CSS.escape(t.q)}"]`) : t.kind === 'tqa' ? $(`.card[data-q="${CSS.escape(t.q)}"][data-a="${t.a}"]`) : t.kind === 'qt' ? $(`.colhd[data-t="${CSS.escape(t.t)}"]`) : null;
  if (!el) return; const lane = $('#lane').getBoundingClientRect(), r = el.getBoundingClientRect(); V.x += lane.left + lane.width / 2 - (r.left + r.right) / 2; V.y += lane.top + 100 - r.top; applyView();
}

// ---------- 说明 ----------
function trainHelp() {
  const d = $('#help .dlg'); if (!S.nightHelp) S.nightHelp = [...d.childNodes];
  d.replaceChildren(h('button', { class: 'x', onclick: () => $('#help').classList.remove('on') }, '关闭 Esc'), h('h2', {}, '后训练模块怎么用'),
    h('p', { class: 't2' }, '这一半管白天的「后训练」：玩家挑一类问题，每道题两个回答选一个，选中的属性在这一类问题上更容易被转到。术语见 CONTEXT.md 的「对口属性」「反例轮」。'),
    h('h3', {}, '问题类型'), h('p', {}, '一类一列。每一类有一个对口属性：这一类大多数轮里能解决问题的那个属性，玩家练它大体能练对。列下面是全库里这一类的反例轮（对口属性浅层解决不了的轮）和缺对口卡的轮，点一张就去夜间剧本打开那一轮。「⚙ 推荐上限」只是推荐值，超了只提醒。'),
    h('h3', {}, '后训练题'), h('p', {}, '左栏点开一类，画布上一道题一列：问题，加 7 段回答（6 个属性 + 开放多样性没学时的乱码版）。点一段改内容、标好坏。好坏标记只给写剧本的人看，游戏不读；校验要求对口属性那段标「好」、六个属性里至少一段标「坏」（乱码版不算）。'),
    h('h3', {}, '在游戏里试做'), h('p', {}, '右下角的小窗是真游戏：选好一对属性，点「▶ 试做这道题」，就弹出玩家看到的成对回答，选完看六维图怎么弹缩。不存档，每次都从全浅层、没练过的盘面开始。'));
  $('#help').classList.add('on');
}
