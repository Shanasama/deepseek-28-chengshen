// 编辑器的「剧情」模块（游戏剧情_设计.md §9）：日程表 + 游戏剧情段 + 角色表。
// 和「夜间剧本」共用 index.html 里的一切：画布（平移 / 缩放）、原地编辑 ed()、积木菜单 / 积木行 / 积木表单、
// 存盘（docs / SAVED / flush）、撤销、校验面板、确认框、迷你预览。这个文件只写剧情这一半自己的东西；
// index.html 的 renderTop / renderSide / renderLane / drawEdges / renderPanel / validate / select 看到 S.mod==='story' 就转到这里。
// 三个画面（S.smode）：sched 日程表总览（每一天哪个挂点挂了哪些剧情、来客是谁）/ seg 一个剧情段的节点图 / chars 角色表。

const SP = '_剧情/', CHARP = SP + '_角色.json', SCHEDP = '_日程表.json';
S.mod = 'night'; S.smode = 'sched'; S.story = null; S.segFile = null;
const segOf = f => S.story?.segs.find(x => x.file === f);
const curSeg = () => segOf(S.segFile)?.doc;
const SHOOK = id => (S.reg.storyHooks || []).find(x => x.id === id);
const SBLK = id => (S.reg.storyBlocks || []).find(x => x.id === id);
const charOf = id => (S.story?.chars.chars || []).find(c => c.id === id);
const nodeOf = (g, id) => (g.nodes || []).find(n => n.id === id);
const FACES = ['开心', '生气', '慌', '震惊', '难过', '疑惑', '得意'];
const ACTN = { pretrain: '预训练', posttrain: '后训练', eat: '吃白饭' };
const HOOKCAT = ['整局', '每天', '事件'];
// 剧情变量的值：和游戏（游戏/js/剧情.js 的 setVar）一样，true / false / 数字转成对应的值
const parseVal = v => v === 'true' ? true : v === 'false' ? false : typeof v === 'string' && v.trim() !== '' && !isNaN(v) ? Number(v) : v;

// ---------- 载入 / 存盘（接进 index.html 的 docs() 和撤销） ----------
async function loadStory() {
  const j = await (await fetch('/api/story?t=' + Date.now())).json();
  let chars; try { chars = await (await fetch('/剧本/' + CHARP + '?t=' + Date.now())).json(); } catch { chars = { chars: j.chars || [] }; }
  S.story = { chars, segs: j.segs.map(({ file, ...doc }) => ({ file, doc })) };
  SAVED[CHARP] = ser(S.story.chars); SAVED[SCHEDP] = ser(S.sched);
  for (const s of S.story.segs) SAVED[SP + s.file] = ser(s.doc);
}
const storyDocs = () => S.story ? [[CHARP, S.story.chars], [SCHEDP, S.sched], ...S.story.segs.map(s => [SP + s.file, s.doc])] : [];
const storySnap = () => S.story ? ser({ c: S.story.chars, g: S.story.segs, d: S.sched }) : '';
function storyRestore(t) { if (!t) return; const o = JSON.parse(t); S.story.chars = o.c; S.story.segs = o.g; S.sched = o.d; if (S.segFile && !segOf(S.segFile)) { S.segFile = null; S.smode = 'sched'; } }
// 外部改了 剧本/_剧情/ 下的文件（比如 Claude 直接改 JSON）：没在这里改过的就换成新的
async function storyExternal() {
  if (!S.story) return;
  const j = await (await fetch('/api/story?t=' + Date.now())).json(); let n = 0;
  const srv = new Map(j.segs.map(({ file, ...doc }) => [file, doc]));
  for (const [file, doc] of srv) {
    const p = SP + file, t = ser(doc), loc = segOf(file);
    if (!loc) { S.story.segs.push({ file, doc }); SAVED[p] = t; n++; continue; }
    if (t === SAVED[p]) continue;
    if (ser(loc.doc) !== SAVED[p]) { toast(`「${p}」在外部被改了，但这里有没保存的改动，以这里为准`); continue; }
    loc.doc = doc; SAVED[p] = t; n++;
  }
  for (const s of [...S.story.segs]) if (!srv.has(s.file) && ser(s.doc) === SAVED[SP + s.file]) { S.story.segs.splice(S.story.segs.indexOf(s), 1); delete SAVED[SP + s.file]; n++; }
  try { const c = await (await fetch('/剧本/' + CHARP + '?t=' + Date.now())).json(), t = ser(c); if (t !== SAVED[CHARP] && ser(S.story.chars) === SAVED[CHARP]) { S.story.chars = c; SAVED[CHARP] = t; n++; } } catch { }
  if (!n) return; if (S.segFile && !segOf(S.segFile)) { S.segFile = null; S.smode = 'sched'; S.sel = null; }
  pushUndoNow(); if (S.mod === 'story') renderAll(); toast('已载入外部改动：剧情');
}

// ---------- 切换模块 ----------
async function setMod(m) {
  if (m === S.mod) return;
  await flush();
  if (m === 'story' && !S.story) { try { await loadStory(); } catch (e) { return toast('读不到剧情：' + e.message); } pushUndoNow(); }
  if (m === 'train') { try { await loadTrain(); } catch (e) { return toast('读不到后训练题库：' + e.message); } pushUndoNow(); }   // 后训练模块.js
  S.mod = m; S.sel = null; S.openBlk = null; $('#app').classList.toggle('story', m !== 'night'); $('#app').classList.toggle('train', m === 'train');   // 后训练借剧情的左栏布局
  history.replaceState(null, '', m === 'story' ? '#剧情' : m === 'train' ? '#后训练' : location.pathname);
  V.x = 0; V.y = 0; V.z = 1; applyView(); S.enter = true; renderAll(); panelIn();
}
function storyGo(smode, file) { S.smode = smode; if (file !== undefined) S.segFile = file; S.sel = null; S.openBlk = null; V.x = 0; V.y = 0; V.z = 1; applyView(); S.enter = true; renderAll(); panelIn(); }
// select() 进来时：校验面板点的是别的剧情段 / 某一天 / 某个角色，先切过去
function storyRoute(t) {
  if (!t) return; if (t.seg && t.seg !== S.segFile && segOf(t.seg)) { S.segFile = t.seg; S.smode = 'seg'; }
  if (t.kind === 'day' || t.kind === 'start') S.smode = 'sched'; if (t.kind === 'char') S.smode = 'chars';
}

// ---------- 顶栏 ----------
function storyTop() {
  const g = curSeg();
  $('#crumb').replaceChildren(...[h('span', {}, '剧情 / '), h('b', {}, S.smode === 'seg' && g ? g.name || g.id : S.smode === 'chars' ? '角色表' : S.smode === 'sprite' ? '工位动画' : '日程表'),
    S.smode === 'seg' && g ? h('span', { class: 'n', title: '这一段挂在哪、哪一天播' }, hookText(g)) : null].filter(Boolean));
  $('#ts').replaceChildren();
}
function modSwitch() {
  const box = $('#modsw'); if (!box) return;
  box.querySelectorAll('a').forEach(a => { a.classList.toggle('on', a.dataset.m === S.mod); a.onclick = () => setMod(a.dataset.m); });
}

// ---------- 左栏 ----------
function hookText(g) {
  const hk = SHOOK(g.hook?.at), p = g.hook || {}, bits = [hk ? hk.name : '挂点「' + (p.at || '没选') + '」'];
  if (p.act) bits.push(ACTN[p.act] || p.act); if (p.slot) bits.push(`第 ${p.slot} 位`); if (p.end) bits.push(endName(p.end)); if (p.attr) bits.push(regAttr(p.attr)?.name || p.attr); if (p.id) bits.push(regName('achievements', p.id));
  if (hk?.cat === '每天') bits.push(g.day == null || g.day === 'every' ? '不限哪天' : Array.isArray(g.day) ? `第 ${g.day.join('、')} 天` : `第 ${g.day} 天`);
  return bits.join(' · ');
}
const endName = e => e === 'full' ? '打满天数' : e === 'hearts' ? '心尽' : regName('achievements', e);
// 左栏：日程表、角色表，下面是全部剧情段，一行一段，按什么时候播分组（和日程表的顺序一样：开场 → 按天 → 结局，事件单列）
const HOOK_ORDER = ['opening', 'morning', 'beforeAct', 'afterAct', 'beforeNight', 'beforeVisitor', 'afterVisitor', 'beforeReport', 'afterReport', 'ending'];
const firstDay = g => g.day == null || g.day === 'every' ? 0 : Array.isArray(g.day) ? Math.min(...g.day) : g.day;
function sideGroup(at) { const k = SHOOK(at); return at === 'opening' ? '开场' : at === 'ending' ? '结局' : k?.cat === '事件' ? '事件' : '按天'; }
// 剧情一多（28 天、每天好几段）就靠这三样找：搜索框按名字过滤；「按天」拆成一天一组；每组都能折叠（记在本机）。
// 默认只展开正在编辑的那一天，别的天收着；搜索时全部展开、只列搜到的。搜索框只建一次，免得每次重画丢了光标
const FOLDK = 'storyFold';
let FOLD = null;
const folded = k => { FOLD ||= (() => { try { return JSON.parse(localStorage.getItem(FOLDK)); } catch { return null; } })() || {}; return FOLD[k] ?? /^第 \d+ 天$/.test(k); };
const setFold = (k, v) => { FOLD[k] = v; try { localStorage.setItem(FOLDK, JSON.stringify(FOLD)); } catch { } };
function sideGroups() {
  const out = new Map(), put = (k, x) => (out.get(k) || out.set(k, []).get(k)).push(x);
  const sorted = [...S.story.segs].sort((a, b) => firstDay(a.doc) - firstDay(b.doc) || HOOK_ORDER.indexOf(a.doc.hook?.at) - HOOK_ORDER.indexOf(b.doc.hook?.at) || a.file.localeCompare(b.file));
  for (const x of sorted) {
    const g = sideGroup(x.doc.hook?.at), d = x.doc.day;
    if (g !== '按天') { put(g, x); continue; }
    if (d == null || d === 'every') put('不限哪天', x); else for (const n of [].concat(d).sort((a, b) => a - b)) put(`第 ${n} 天`, x);
  }
  const order = k => k === '开场' ? -2 : k === '不限哪天' ? -1 : k === '结局' ? 1e4 : k === '事件' ? 1e4 + 1 : +k.replace(/\D/g, '');
  return [...out.entries()].sort((a, b) => order(a[0]) - order(b[0]));
}
function storySide() {
  const box = $('#sside');
  if (!box.querySelector('#sslist')) {   // 左栏和后训练模块共用 #sside，切回来要重建
    box.replaceChildren(h('div', { class: 'sstop' }), h('input', { class: 'sfind', type: 'search', placeholder: '🔍 搜剧情段的名字', oninput: e => { S.sfind = e.target.value.trim(); renderSideList(); } }), h('div', { id: 'sslist' }));
  }
  box.querySelector('.sstop').replaceChildren(h('h6', {}, '剧情'),
    h('div', { class: 'scene' + (S.smode === 'sched' ? ' on' : ''), title: '每一天的安排，以及每个时刻挂了哪些剧情', onclick: () => storyGo('sched') }, h('span', { class: 'o' }, '📅'), '日程表'),
    h('div', { class: 'scene' + (S.smode === 'chars' ? ' on' : ''), title: '剧情里说话的角色：名字、颜色、立绘', onclick: () => storyGo('chars') }, h('span', { class: 'o' }, '🎭'), '角色表'),
    h('div', { class: 'scene' + (S.smode === 'sprite' ? ' on' : ''), title: '游戏里工位上的大肥鱼：查合伙人交的逐帧动画，放进真实工位里播，装进游戏', onclick: () => storyGo('sprite') }, h('span', { class: 'o' }, '🐟'), '工位动画'),
    h('div', { class: 'sgh' }, h('h6', {}, `剧情段 · ${S.story.segs.length}`),
      h('span', {}, h('button', { title: '全部收起 / 全部展开', onclick: () => { const gs = sideGroups().map(([k]) => k), all = gs.every(folded); gs.forEach(k => setFold(k, !all)); renderSideList(); } }, '⇕'),
        h('button', { title: '新建一段剧情（也可以在日程表的格子里点 ＋）', onclick: () => newSeg() }, '＋ 新建'))));
  renderSideList();
}
function renderSideList() {
  const box = $('#sslist'); if (!box) return; box.replaceChildren();
  const q = (S.sfind || '').toLowerCase(), cur = S.smode === 'seg' ? S.segFile : null;
  for (const [k, all] of sideGroups()) {
    const list = q ? all.filter(x => ((x.doc.name || '') + ' ' + (x.doc.id || '') + ' ' + (x.doc.note || '')).toLowerCase().includes(q)) : all;
    if (!list.length) continue;
    const open = q || list.some(x => x.file === cur) || !folded(k);
    box.append(h('div', { class: 'sgg' + (open ? ' open' : ''), title: open ? '点击收起' : '点击展开', onclick: () => { setFold(k, open); renderSideList(); } }, h('span', { class: 'ar' }, open ? '▾' : '▸'), k, h('i', {}, list.length)));
    if (!open) continue;
    for (const x of list) box.append(h('div', { class: 'scene sg' + (x.file === cur ? ' on' : ''), title: hookText(x.doc) + (x.doc.note ? '\n' + x.doc.note : ''), onclick: () => storyGo('seg', x.file) },
      h('span', { class: 'sgn' }, x.doc.name || x.doc.id), issueDot({ kind: 'seg', seg: x.file }), h('span', { class: 'sgd' }, sideTag(x.doc))));
  }
  if (q && !box.children.length) box.append(h('div', { class: 'note', style: 'padding:8px' }, '没有名字里带「' + S.sfind + '」的剧情段'));
}
// 列表右边的小字：哪个时刻（组名已经说了哪一天）
const sideTag = g => { const k = SHOOK(g.hook?.at), p = g.hook || {}; if (p.at === 'opening') return ''; if (p.at === 'ending') return p.end ? endName(p.end) : '所有结局'; return (k?.name || '') + (p.slot ? ` · 第 ${p.slot} 位` : '') + (p.act ? ' · ' + (ACTN[p.act] || p.act) : ''); };

// ---------- 新建 / 删除 ----------
const sid = () => 'seg-' + Date.now().toString(36);
async function newSeg(hook = null, day = null) {
  const hooks = S.reg.storyHooks.map(x => `${x.cat} · ${x.name}`);
  const v = await ask('新建剧情段', [{ key: 'name', label: '名字', required: true, ph: '如「第 2 天早上：老板来了」', hint: '只给写手看' },
    ...(hook ? [] : [{ key: 'hook', label: '挂在哪', options: hooks, value: hooks[2], hint: '什么时候播；建好以后还能改' }])]);
  if (!v) return;
  const at = hook ? hook.at : S.reg.storyHooks[hooks.indexOf(v.hook)].id;
  const n = Math.max(-1, ...S.story.segs.map(s => parseInt(s.file) || 0)) + 1, file = `${String(n).padStart(2, '0')}_${safeName(v.name)}.json`;
  const doc = { id: sid(), name: v.name, hook: { ...(hook || {}), at }, ...(day != null ? { day } : {}), nodes: [{ id: 'n1', name: '开头', steps: [] }] };
  try { await flush(); await putFile(SP + file, ser(doc), 'POST'); SAVED[SP + file] = ser(doc); S.story.segs.push({ file, doc }); pushUndoNow(); storyGo('seg', file); select({ kind: 'node', seg: file, node: 'n1' }); toast('已新建剧情段「' + v.name + '」，在右边加积木'); }
  catch (e) { toast('创建失败：' + e.message); }
}
async function deleteSeg(s) {
  if (!await confirmBox(`删除剧情段「${s.doc.name || s.doc.id}」？`, [`会删掉文件 剧本/${SP}${s.file}。`, '删掉的文件撤销不回来（撤销只能把内容写回去）。'], '删除')) return;
  try { const r = await fetch('/api/file?p=' + encodeURIComponent(SP + s.file), { method: 'DELETE' }); if (!r.ok) throw new Error((await r.json()).error); }
  catch (e) { return toast('删除失败：' + e.message); }
  S.story.segs.splice(S.story.segs.indexOf(s), 1); delete SAVED[SP + s.file]; pushUndoNow(); storyGo('sched'); toast('已删除剧情段');
}
function newNode(g, near) {
  const k = Math.max(0, ...g.nodes.map(n => parseInt(String(n.id).replace(/\D/g, '')) || 0)) + 1, at = near ? nodePos(g, near) : { x: 60, y: 60 };
  const n = { id: 'n' + k, name: '新节点', steps: [], x: at.x + 320, y: at.y + 40 * (g.nodes.length % 4) }; g.nodes.push(n); return n;
}

// ---------- 节点图（一个剧情段） ----------
// 节点没摆过位置（x / y）就按「从开始节点往后走几步」自动排一排；拖动之后才写进文件
function layout(g) {
  const pos = new Map(), start = g.start || g.nodes[0]?.id, depth = new Map([[start, 0]]), q = [start];
  while (q.length) { const id = q.shift(), n = nodeOf(g, id); if (!n) continue; for (const o of outs(n)) if (o.to && !depth.has(o.to)) { depth.set(o.to, depth.get(id) + 1); q.push(o.to); } }
  const rows = {};
  for (const n of g.nodes) { const d = depth.get(n.id) ?? (Math.max(0, ...depth.values()) + 1), r = rows[d] = (rows[d] || 0) + 1; pos.set(n.id, { x: 40 + d * 330, y: 30 + (r - 1) * 250 }); }
  return pos;
}
let LAYOUT = new Map();
const nodePos = (g, id) => { const n = nodeOf(g, id); return n && n.x != null ? { x: n.x, y: n.y } : LAYOUT.get(id) || { x: 40, y: 30 }; };
// 一个节点往外的路：选项、条件跳转、跳到某节点、进结局、结束、走完接 next
function outs(n) {
  const o = []; let closed = false;
  for (const b of n.steps || []) {
    if (b.do === 'choice') { for (const op of b.options || []) o.push({ lbl: '选「' + (op.text || '…') + '」', to: op.to || null, k: 'opt' }); if ((b.options || []).every(x => x.to)) closed = true; }
    else if (b.do === 'if') { o.push({ lbl: '满足条件', to: b.to || null, k: 'if' }); if (b.else) { o.push({ lbl: '不满足', to: b.else, k: 'else' }); closed = true; } }
    else if (b.do === 'goto') { o.push({ lbl: '跳转', to: b.to || null, k: 'goto' }); closed = true; break; }
    else if (b.do === 'ending') { o.push({ lbl: '进结局：' + endName(b.id), end: true, k: 'ending' }); closed = true; break; }
    else if (b.do === 'end') { o.push({ lbl: '结束这一段', end: true, k: 'end' }); closed = true; break; }
  }
  if (!closed) o.push(n.next ? { lbl: '走完接着', to: n.next, k: 'next' } : { lbl: '走完就结束', end: true, k: 'end' });
  return o;
}
function storyCanvas() {
  const lane = $('#laneIn'); lane.replaceChildren(); ISSUES = validate(); renderValidBtn();
  $('#legend').replaceChildren(h('span', { style: 'cursor:pointer;color:var(--lgold)', onclick: openHelp }, '？ 剧情模块怎么用'));
  if (S.smode === 'sched') return schedCanvas(lane);
  if (S.smode === 'chars') return charsCanvas(lane);
  if (S.smode === 'sprite') return spriteCanvas(lane);   // 立绘检查.js
  const g = curSeg(); if (!g) return storyGo('sched');
  LAYOUT = layout(g);
  const start = g.start || g.nodes[0]?.id;
  lane.append(h('div', { class: 'sghd nopan' },
    h('div', { class: 'sgt' }, h('b', {}, g.name || g.id), h('span', { class: 'tag' }, hookText(g)), g.when?.length ? h('span', { class: 'tag', title: '有进入条件：满足才播' }, '⚑ 有条件') : null, g.now ? h('span', { class: 'tag', title: '立即：对话中间也马上播' }, '⚡ 立即') : null),
    h('div', { class: 'shbtns' },
      h('button', { class: 'mini', onclick: () => select({ kind: 'seg', seg: S.segFile }) }, '⚙ 什么时候播'),
      h('button', { class: 'mini', onclick: () => { const n = newNode(g, S.sel?.node || start); changed(); select({ kind: 'node', seg: S.segFile, node: n.id }); } }, '＋ 新节点'),
      h('button', { class: 'mini', title: '在旁边的小窗口里从开始节点一路播下去（选项取第一个，条件按「满足」走）', onclick: () => previewSeg(g) }, '▶ 预览'))));
  const graph = h('div', { class: 'sgraph' }); lane.append(graph);
  let W = 0, H = 0;
  for (const n of g.nodes) {
    const p = nodePos(g, n.id), sel = S.sel?.kind === 'node' && S.sel.node === n.id, list = n.steps || [];
    const el = h('div', { class: 'snode nopan' + (sel ? ' sel' : '') + (S.enter ? ' enter' : ''), 'data-node': n.id, style: `left:${p.x}px;top:${p.y}px`, onclick: e => { if (!e.target.closest('.snp')) select({ kind: 'node', seg: S.segFile, node: n.id }); } },
      h('div', { class: 'snh', title: '拖这里移动节点' }, n.id === start ? h('span', { class: 'snst', title: '这一段从这里开始播' }, '▶ 开始') : null, h('b', {}, n.name || n.id), issueDot({ kind: 'node', seg: S.segFile, node: n.id })),
      h('div', { class: 'snb' }, list.length ? list.slice(0, 6).map(b => { const d = BLK(b.do); return h('div', { class: 'snl', title: d?.desc || '' }, h('span', { class: 'bic' }, d?.icon || '❓'), h('span', {}, blockSummary(b) || d?.name || b.do)); }) : h('div', { class: 'note' }, '（还没有积木，点开在右边加）'),
        list.length > 6 ? h('div', { class: 'note' }, `…还有 ${list.length - 6} 块`) : null),
      h('div', { class: 'snps' }, outs(n).map((o, i) => h('div', { class: 'snp ' + o.k + (o.end ? ' end' : '') + (!o.end && !o.to ? ' open' : ''), 'data-port': i, title: o.end ? '这一段到这里结束' : o.to ? '连到「' + (nodeOf(g, o.to)?.name || o.to) + '」' : '还没连到哪个节点：在右边选' }, o.lbl, h('i', {}, o.end ? '■' : o.to ? '→' : '?')))));
    dragNode(el.querySelector('.snh'), g, n); graph.append(el);
    W = Math.max(W, p.x + 300); H = Math.max(H, p.y + 280);
  }
  graph.style.width = W + 'px'; graph.style.height = H + 'px';
  requestAnimationFrame(storyEdges);
}
// 拖节点：按住标题栏拖；松手才算一步改动（写进 x / y）
function dragNode(hd, g, n) {
  hd.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; e.stopPropagation(); const p0 = nodePos(g, n.id), x0 = e.clientX, y0 = e.clientY, el = hd.parentElement; let moved = false;
    hd.setPointerCapture(e.pointerId);
    hd.onpointermove = ev => { const dx = (ev.clientX - x0) / V.z, dy = (ev.clientY - y0) / V.z; if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return; moved = true; n.x = Math.round(p0.x + dx); n.y = Math.round(p0.y + dy); el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; storyEdges(); };
    hd.onpointerup = () => { hd.onpointermove = hd.onpointerup = null; if (moved) { changed(); } };
  });
}
function storyEdges() {
  if (S.smode === 'sched') return schedEdges();
  const graph = $('.sgraph'); if (!graph) return; graph.querySelector('#edges')?.remove();
  const g = curSeg(); if (!g) return;
  const G0 = graph.getBoundingClientRect(), z = V.z, pos = el => { const r = el.getBoundingClientRect(); return { l: (r.left - G0.left) / z, r: (r.right - G0.left) / z, t: (r.top - G0.top) / z, m: ((r.top + r.bottom) / 2 - G0.top) / z }; };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'edges'; svg.setAttribute('width', graph.offsetWidth); svg.setAttribute('height', graph.offsetHeight);
  const COLS = { opt: '#FFD57A', if: '#4FCF8A', else: '#ff9aa1', goto: '#C2A6FF', next: '#6E6E75' };
  for (const n of g.nodes) {
    const el = graph.querySelector(`.snode[data-node="${CSS.escape(n.id)}"]`); if (!el) continue;
    outs(n).forEach((o, i) => {
      if (!o.to) return; const t = graph.querySelector(`.snode[data-node="${CSS.escape(o.to)}"] .snh`), port = el.querySelector(`.snp[data-port="${i}"]`); if (!t || !port) return;
      const a = pos(port), b = pos(t), x1 = a.r, y1 = a.m, x2 = b.l, y2 = b.m, dx = Math.max(40, Math.abs(x2 - x1) / 2);
      const sel = S.sel?.kind === 'node' && (S.sel.node === n.id || S.sel.node === o.to);
      const p = document.createElementNS(svg.namespaceURI, 'path');
      p.setAttribute('d', x2 > x1 ? `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1 + 80},${y1} ${x2 - 80},${y2 - 120} ${x2},${y2}`);
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', COLS[o.k] || '#6E6E75'); p.setAttribute('stroke-width', sel ? '2.5' : '1.5'); p.setAttribute('opacity', sel ? '1' : '.7');
      if (sel) p.setAttribute('class', 'esel'); else if (S.enter) p.setAttribute('class', 'draw');
      svg.append(p);
    });
  }
  graph.prepend(svg); S.enter = false;
}

// ---------- 日程表总览：和夜间剧本一样，一天一列卡片，从上往下按游戏里发生的顺序串成一串，最后一张连到下一天 ----------
// 卡片用夜间剧本的样式（.col / .colhd / .card / .empty）：挂了剧情的时刻是一张剧情卡，夜里每位来客是一张来客卡；
// 空着的时刻只在串线上留一个小 ＋（鼠标移上去才显示是哪个时刻），点它就在那个时刻新建一段剧情。
const segsAt = (at, day) => S.story.segs.filter(s => { const k = s.doc.hook || {}; if (k.at !== at.at) return false; for (const p of ['act', 'slot', 'end', 'id', 'attr']) if (at[p] != null && k[p] != null && k[p] !== '' && k[p] !== at[p]) return false;   // 时刻写了参数（第几位、哪种结局）才比；时刻不限的就都列出来
  if (day == null) return true; const d = s.doc.day; return d == null || d === 'every' || (Array.isArray(d) ? d.includes(day) : d === day); });
const EVICON = { egg: '🥚', heartLost: '💔', quotaLow: '🪫', tibo: '📱', deepFirst: '📚', rollback: '⏪' };
const MCOL = { day: '#FFD57A', night: '#5AA0FF', opening: '#4FCF8A', ending: '#C2A6FF', event: '#4FD8D0', visitor: '#3F6EE8' };
// 一张剧情卡：哪个时刻 / 剧情段名字 / 不限哪天、有条件、立即
function segCard(s, label, col, day) {
  const g = s.doc, every = day != null && (g.day == null || g.day === 'every'), n = (g.nodes || []).reduce((k, x) => k + (x.steps || []).length, 0);
  return h('div', { class: 'card ch nopan', title: hookText(g) + (g.note ? '\n' + g.note : '') + '\n点击打开这一段', onclick: () => storyGo('seg', s.file) },
    h('div', { class: 'bar', style: `background:${col}` }),
    h('div', { class: 'bd' },
      h('div', { class: 'l0' }, h('span', { style: 'display:flex;gap:4px;align-items:center' }, h('span', { class: 'atag', style: `color:${col};background:${col}22` }, label), issueDot({ kind: 'seg', seg: s.file })), h('span', { class: 'go p' }, '▶ 剧情')),
      h('div', { class: 'l1' }, h('span', { class: 'tok' }, g.name || g.id)),
      h('div', { class: 'l2' }, every ? h('span', { class: 'badge', title: '不限哪一天：哪天走到这个时刻都可能播（播几次看「只播一次」）' }, '不限哪天') : null, g.when?.length ? h('span', { class: 'badge', title: '有进入条件：满足才播' }, '⚑ 有条件') : null,
        g.now ? h('span', { class: 'badge', title: '对话中间也马上播' }, '⚡ 立即') : null, g.once === false ? h('span', { class: 'badge', title: '每次走到这里都播' }, '每次都播') : null, h('span', { class: 'hit' }, `${g.nodes?.length || 0} 个节点 · ${n} 块积木`))));
}
// 一个时刻：挂了剧情就一张张剧情卡，没挂就是串线上的一个小 ＋
function moment(label, at, day, col) {
  const list = segsAt(at, day), add = () => newSeg(Object.fromEntries(Object.entries(at).filter(([, v]) => v != null)), SHOOK(at.at)?.cat === '每天' ? day : null);
  if (!list.length) return [h('button', { class: 'chadd ch nopan', 'data-l': '在「' + label + '」加剧情', title: (SHOOK(at.at)?.brief || '') + '\n点一下在这个时刻新建一段剧情', onclick: add }, '＋')];
  return [...list.map(s => segCard(s, label, col, day)), h('button', { class: 'chadd ch nopan', 'data-l': '在「' + label + '」再加一段', onclick: add }, '＋')];
}
const slotsOf = d => d.slots || [...Array(Math.max(0, (d.visitors ?? 4) - (d.fixed || []).length)).fill('random'), ...(d.fixed || []).map(user => ({ user }))];
const userName = dir => S.list.find(u => u.dir === dir)?.user.name || dir;
function visitorCard(v, i, d) {
  const u = v === 'random' ? null : S.list.find(x => x.dir === v.user);
  return h('div', { class: 'card ch vcard nopan', title: '夜里第 ' + (i + 1) + ' 位用户；点击改这一天的来客', onclick: () => select({ kind: 'day', day: d.day }) },
    h('div', { class: 'bar', style: `background:${MCOL.visitor}` }),
    h('div', { class: 'bd' },
      h('div', { class: 'l0' }, h('span', { class: 'atag', style: `color:${MCOL.visitor};background:${MCOL.visitor}22` }, `第 ${i + 1} 位来客`), h('span', { class: 'go' }, '👤 用户上线')),
      h('div', { class: 'l1' }, h('span', { class: 'tok', style: 'color:var(--ice)' }, u ? u.user.name : '随机来一位'), h('span', { class: 'pv' }, u ? '' : '从还有没来过的场景的用户里抽')),
      h('div', { class: 'l2' }, u?.user.boss ? h('span', { class: 'tag boss' }, 'Boss') : null, v !== 'random' ? h('span', { class: 'badge' }, v.scene ? v.scene.replace(/\.json$/, '') : '下一个没用过的场景') : null)));
}
function schedCanvas(lane) {
  const sc = S.sched, wrap = h('div', { class: 'sched' }); lane.append(wrap);
  // 事件不分哪天、发生了那件事就播：顶上一排，和下面同样的列（不串线）
  const ev = h('div', { class: 'tlrow2 evlane' }, h('div', { class: 'tllane' }, h('b', {}, '⚡ 随时触发'), h('span', {}, '不分哪一天，发生了这件事就播')));
  for (const x of S.reg.storyHooks.filter(x => x.cat === '事件'))
    ev.append(h('div', { class: 'col' + (S.enter ? ' enter' : '') }, h('div', { class: 'colhd', title: x.desc, style: 'cursor:default' }, h('div', { class: 'no' }, h('b', {}, (EVICON[x.id] || '⚡') + ' ' + x.name)), h('div', { class: 'need' }, x.brief || '')), ...moment(x.name, { at: x.id }, null, MCOL.event)));
  wrap.append(ev, h('div', { class: 'tllbl' }, '📅 一整局：从左往右，从上往下按游戏里发生的顺序；每一天的最后连到下一天'));
  const tl = h('div', { class: 'tlrow2 chain' }); wrap.append(tl);
  const col = (head, items, cls = '') => h('div', { class: 'col ' + cls + (S.enter ? ' enter' : '') }, head, ...items);
  const hd = (title, sub, kind, extra) => h('div', { class: 'colhd ch nopan' + (S.sel?.kind === kind.kind && (kind.day == null || S.sel.day === kind.day) ? ' sel' : ''), title: '点击改这里的设置', onclick: () => select(kind) },
    h('div', { class: 'no' }, h('b', {}, title), extra || null), h('div', { class: 'need' }, sub));
  tl.append(col(hd('开局 · 新游戏', `心 ${sc.start.hearts} · 控盘额度 ${sc.start.quota}/${sc.start.quotaMax} · 回档 ${sc.start.rollbacks} 次`, { kind: 'start' }), moment('开场', { at: 'opening' }, null, MCOL.opening)));
  const days = [...sc.days].sort((a, b) => a.day - b.day);
  for (const d of days) {
    const tut = d.event === 'tutorial', items = [h('div', { class: 'slotlbl' }, h('span', {}, '☀ 白天'), h('span', {}, tut ? '' : `行动点 ${d.ap ?? 4}`))];
    items.push(...moment('早上开工前', { at: 'morning' }, d.day, MCOL.day));
    if (!tut) items.push(...moment('白天活动之前', { at: 'beforeAct' }, d.day, MCOL.day), ...moment('白天活动之后', { at: 'afterAct' }, d.day, MCOL.day), ...moment('开始营业前', { at: 'beforeNight' }, d.day, MCOL.night));
    items.push(h('div', { class: 'slotlbl' }, h('span', {}, '☾ 夜里'), h('span', {}, tut ? '出厂测试' : `${slotsOf(d).length} 位来客`)));
    (tut ? [{ user: d.tutor, scene: d.scene }] : slotsOf(d)).forEach((v, i) => items.push(...moment(`第 ${i + 1} 位上线前`, { at: 'beforeVisitor', slot: i + 1 }, d.day, MCOL.night), visitorCard(v, i, d), ...moment(`第 ${i + 1} 位离开后`, { at: 'afterVisitor', slot: i + 1 }, d.day, MCOL.night)));
    items.push(...moment('每晚结算前', { at: 'beforeReport' }, d.day, MCOL.night), ...moment('每晚结算后', { at: 'afterReport' }, d.day, MCOL.night));
    tl.append(col(hd(`第 ${d.day} 天${d.name ? ' · ' + d.name : ''}`, tut ? '出厂测试（新手教学）' : `${(d.activities || ['pretrain', 'posttrain', 'eat']).map(a => ACTN[a] || a).join(' / ')}${d.resetQuota ? ' · 早上额度回满' : ''}`, { kind: 'day', day: d.day }, issueDot({ kind: 'day', day: d.day })), items, tut ? 'tut' : ''));
  }
  tl.append(h('div', { class: 'addcol nopan', title: '在最后加一天', onclick: addDay }, h('div', { style: 'font-size:20px' }, '＋'), '加一天'));
  // 结局：这一局怎么结束的，播完进最终评测
  const last = days.at(-1)?.day, story = S.reg.achievements.filter(a => a.ending && !['end-full', 'end-hearts'].includes(a.id));
  tl.append(col(h('div', { class: 'colhd ch', style: 'cursor:default' }, h('div', { class: 'no' }, h('b', {}, '🏁 结局')), h('div', { class: 'need' }, '这一局结束时播，播完进最终评测。剧情结局要在剧情里放「进结局」积木，结局先登记在登记表 achievements（ending: true）')),
    [...moment(`打满 ${last} 天`, { at: 'ending', end: 'full' }, null, MCOL.ending), ...moment('心扣光了', { at: 'ending', end: 'hearts' }, null, MCOL.ending),
      ...story.flatMap(a => moment('剧情结局：' + a.name, { at: 'ending', end: a.id }, null, MCOL.ending))]));
  requestAnimationFrame(schedEdges);
}
// 串线：每一列里从上往下一张连一张；一列的最后连到下一列的列头（和夜间剧本「一轮连下一轮」一个画法）
function schedEdges() {
  const tl = $('.tlrow2.chain'); if (!tl) return; tl.querySelector('#edges')?.remove();
  const T = tl.getBoundingClientRect(), z = V.z, pos = el => { const r = el.getBoundingClientRect(); return { l: (r.left - T.left) / z, r: (r.right - T.left) / z, t: (r.top - T.top) / z, b: (r.bottom - T.top) / z, c: ((r.left + r.right) / 2 - T.left) / z }; };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'edges'; svg.setAttribute('width', tl.scrollWidth); svg.setAttribute('height', tl.scrollHeight);
  const path = (d, op = .55) => { const p = document.createElementNS(svg.namespaceURI, 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#6E6E75'); p.setAttribute('stroke-width', '1.5'); p.setAttribute('opacity', op); if (S.enter) p.setAttribute('class', 'draw'); svg.append(p); };
  const cols = [...tl.querySelectorAll(':scope > .col')];
  cols.forEach((c, k) => {
    const chain = [...c.querySelectorAll(':scope > .ch')];
    for (let i = 1; i < chain.length; i++) { const a = pos(chain[i - 1]), b = pos(chain[i]); path(`M${a.c},${a.b} L${b.c},${b.t}`); }
    const next = cols[k + 1]?.querySelector(':scope > .colhd'), endEl = chain.at(-1);
    if (next && endEl) { const a = pos(endEl), b = pos(next), x1 = a.c, y1 = a.b, x2 = b.l, y2 = (b.t + b.b) / 2; path(`M${x1},${y1} C${x1},${y1 + 40} ${x2 - 60},${y2} ${x2},${y2}`, .8); }
  });
  tl.prepend(svg); S.enter = false;
}
function addDay() { const ds = S.sched.days, last = ds.reduce((a, b) => b.day > a.day ? b : a, ds[0]); const d = { day: last.day + 1, ap: last.ap ?? 4, postPerDay: last.postPerDay ?? 2, slots: ['random', 'random', 'random', 'random'], activities: ['pretrain', 'posttrain', 'eat'] }; ds.push(d); changed(); select({ kind: 'day', day: d.day }); toast(`已加第 ${d.day} 天（存档版本随天数变：旧存档会读不了）`); }

// ---------- 角色表 ----------
function portraitImg(c, face, cls = 'cpic') {
  const src = c.portraits?.[face] || c.portraits?.['默认'];
  const im = h('img', { class: cls + (src ? '' : ' ph'), alt: '', src: src ? '/剧本/' + SP + src : window.FISH_SRC || '' });
  if (!src && c.tint) im.style.filter = `hue-rotate(${c.tint}deg)`; im.onerror = () => { im.src = window.FISH_SRC || ''; im.classList.add('ph'); }; return im;
}
function charsCanvas(lane) {
  const box = h('div', { class: 'chars' }); lane.append(box);
  for (const c of S.story.chars.chars) {
    const used = S.story.segs.filter(s => JSON.stringify(s.doc.nodes).includes(`"who":"${c.id}"`)).length;
    box.append(h('div', { class: 'charc nopan' + (S.sel?.kind === 'char' && S.sel.id === c.id ? ' sel' : ''), onclick: () => select({ kind: 'char', id: c.id }) },
      portraitImg(c, '默认'), h('b', { style: `background:${c.color || '#3F6EE8'}` }, c.name), h('div', { class: 'note' }, `编号 ${c.id} · ${used ? used + ' 段剧情里说话' : '还没出场'}`),
      h('div', { class: 'note' }, Object.keys(c.portraits || {}).length ? '立绘：' + Object.keys(c.portraits).join('、') : '没有立绘 · 先用大肥鱼占位'), issueDot({ kind: 'char', id: c.id })));
  }
  box.append(h('div', { class: 'charc add nopan', onclick: newChar }, h('div', { style: 'font-size:24px' }, '＋'), '新角色'));
}
async function newChar() {
  const v = await ask('新角色', [{ key: 'name', label: '名字', required: true, ph: '如「老板」' }, { key: 'id', label: '编号', required: true, ph: '英文，如 boss', hint: '剧情里用它指这个角色，建好不要改' }]);
  if (!v) return; if (charOf(v.id)) return toast('已经有编号「' + v.id + '」的角色了');
  const c = { id: v.id, name: v.name, color: '#5AA0FF', tint: Math.floor(Math.random() * 300) + 30, portraits: {} }; S.story.chars.chars.push(c); changed(); select({ kind: 'char', id: c.id });
}

// ---------- 右栏 ----------
function storyPanel(P) {
  const s = S.sel;
  if (!s) return;   // 没选东西时右栏收起来（index.html 的 renderPanel）
  if (s.kind === 'seg') return segPanel(P);
  if (s.kind === 'node') return nodePanel(P);
  if (s.kind === 'day') return dayPanel(P);
  if (s.kind === 'start') return startPanel(P);
  if (s.kind === 'char') return charPanel(P);
}
const hd = (ttl, sub, tab) => h('div', { class: 'hd' }, h('div', { class: 'ttl' }, ttl), h('div', { class: 'sub' }, sub), h('div', { class: 'tabs' }, h('button', { class: 'on' }, tab)));
// 勾选框：和默认值一样就不写进文件
const check = (obj, key, label, { dflt = false, onchange } = {}) => { const e = h('input', { type: 'checkbox' }); e.checked = obj[key] === undefined ? dflt : !!obj[key];
  e.onchange = () => { if (e.checked === dflt) delete obj[key]; else obj[key] = e.checked; changed(); onchange?.(); }; return h('label', { class: 'ck' }, e, label); };
// 数字输入：清空就删掉这个字段（= 不写 / 不限）
const numOpt = (obj, key, { step = 1, ph = '' } = {}) => { const e = h('input', { type: 'number', step, placeholder: ph }); e.value = obj[key] ?? ''; e.oninput = () => { if (e.value === '') delete obj[key]; else { const v = parseFloat(e.value); if (!isNaN(v)) obj[key] = v; } changed(); }; return e; };

function segPanel(P) {
  const sg = segOf(S.segFile), g = sg.doc, hk = SHOOK(g.hook?.at);
  P.append(hd('什么时候播 · ' + (g.name || g.id), `剧情段 · 剧本/${SP}${sg.file} · 编号 ${g.id}`, '设置'));
  const F = h('div', { class: 'form' }); P.append(F);
  F.append(h('div', { class: 'shname' }, ed({ ...fieldIO(g, 'name'), label: '这一段的名字', single: true, ph: '名字' })), ed({ ...fieldIO(g, 'note'), label: '备注（只给写手看）', ph: '这一段演什么、为什么放在这里' }));
  const hs = h('select', {}); for (const c of HOOKCAT) { const og = h('optgroup', { label: c }); for (const x of S.reg.storyHooks.filter(x => x.cat === c)) og.append(h('option', { value: x.id }, x.name)); hs.append(og); }
  hs.value = g.hook?.at || ''; hs.onchange = () => { g.hook = { at: hs.value }; if (SHOOK(hs.value)?.cat !== '每天') delete g.day; if (SHOOK(hs.value)?.cat !== '事件') delete g.now; changed(); renderPanel(); };
  const sum = h('div', {}, playSummary(g)); F.append(h('div', { class: 'phint ok', style: 'margin:0' }, h('b', {}, '这一段什么时候播'), sum));
  const upd = () => setTimeout(() => { sum.textContent = playSummary(g); }); F.addEventListener('input', upd); F.addEventListener('change', upd);   // 下面随便改哪项，这句话跟着变
  const box = h('div', { class: 'box' }, h('b', {}, '挂在哪：游戏走到这一刻就播'), field('挂点', hs), h('div', { class: 'note' }, hk?.desc || ''));
  for (const p of hk?.params || []) box.append(field(p.n, hookParam(g, p)));
  if (hk?.cat === '每天') {
    const d = g.day, mode = d == null || d === 'every' ? 'every' : 'some', ms = h('select', {}, h('option', { value: 'every' }, '不限哪一天'), h('option', { value: 'some' }, '只在某几天'));
    ms.value = mode; ms.onchange = () => { if (ms.value === 'every') delete g.day; else g.day = 1; changed(); renderPanel(); };
    const di = h('input', { type: 'text', placeholder: '如 2，或 1, 3' }); di.value = Array.isArray(d) ? d.join(', ') : mode === 'some' ? d : '';
    di.oninput = () => { const ns = di.value.split(/[,，、\s]+/).map(Number).filter(n => n >= 0 && !isNaN(n)); if (!ns.length) return; g.day = ns.length === 1 ? ns[0] : ns; changed(); };
    box.append(field('哪一天', h('div', { class: 'say' }, ms, mode === 'some' ? di : h('span'))));
  }
  box.append(field('进入条件', condsEd(g, 'when'), '全部满足才播；不加就是无条件'));
  F.append(box);
  const b2 = h('div', { class: 'box' }, h('b', {}, '播几次、谁先谁后'),
    check(g, 'once', '这一局只播一次（不勾 = 每次走到这里都播）', { dflt: true }),
    h('div', { class: 'row' }, field('优先级', numOpt(g, 'priority', { ph: '0' }), '同一挂点大的先播'), field('互斥组', txt(g, 'group', { ph: '不写 = 不互斥' }), '同组只播排最前的一段')));
  if (hk?.cat === '事件') b2.append(check(g, 'now', '⚡ 立即：对话中间也马上播（只能用窗口里的积木，不能用全屏对白、字幕、插画、选项）', { onchange: () => renderLane() }));
  F.append(b2);
  P.append(acts(['删除这一段剧情', () => deleteSeg(sg), true, '删掉这个文件']));
}
// 设置面板顶上的白话总结，例：「不限哪一天，第一次走到『白天活动之后 · 预训练』就播；这一局只播一次，以后再走到这里不播。」
function playSummary(g) {
  const hk = SHOOK(g.hook?.at); if (!hk) return '还没选挂点，不会播。';
  const p = g.hook || {}, where = [hk.name, p.act && (ACTN[p.act] || p.act), p.slot && `第 ${p.slot} 位`, p.end && endName(p.end), p.attr && (regAttr(p.attr)?.name || p.attr), p.id && regName('achievements', p.id)].filter(Boolean).join(' · ');
  const day = hk.cat !== '每天' ? '' : g.day == null || g.day === 'every' ? '不限哪一天，' : `只在${Array.isArray(g.day) ? '第 ' + g.day.join('、') + ' 天' : '第 ' + g.day + ' 天'}，`;
  const cond = g.when?.length ? `而且 ${g.when.length} 个进入条件都满足时` : '';
  return g.once === false ? `${day}每次走到「${where}」${cond}都播。` : `${day}第一次走到「${where}」${cond}就播；这一局只播一次，以后再走到这里不播。`;
}
// 挂点参数：哪种活动 / 第几位来客 / 哪种结局 / 哪个彩蛋 / 哪个属性
function hookParam(g, p) {
  const k = g.hook, clean = () => { if (k[p.k] === '' || k[p.k] == null) delete k[p.k]; renderLane(); };   // 选「不限」就删掉这个参数（写成空字符串会被当成「必须是空」）
  if (k.at === 'ending' && p.k === 'end') return sel(k, 'end', [['', '不限'], ['full', '打满天数'], ['hearts', '心尽'], ...S.reg.achievements.filter(a => a.ending && !['end-full', 'end-hearts'].includes(a.id)).map(a => [a.id, a.name])], { onchange: clean });
  if (k.at === 'egg' && p.k === 'id') return sel(k, 'id', [['', '哪个彩蛋都行'], ...S.reg.achievements.filter(a => !a.ending).map(a => [a.id, a.name])], { onchange: clean });
  if (p.t === 'select') return sel(k, p.k, p.opts, { onchange: clean });
  if (p.t === 'number') return numOpt(k, p.k, { ph: '不写 = 每一位' });
  return txt(k, p.k);
}
// 条件编辑：一行一个，全部满足才算满足（和 规则.js 的 storyCond 同一套写法）
function condsEd(obj, key) {
  const list = obj[key] || [], box = h('div', { class: 'conds' });
  const up = () => { if (!list.length) delete obj[key]; else obj[key] = list; changed(); renderPanel(); };
  const OPS = [['==', '等于'], ['!=', '不等于'], ['>=', '≥'], ['<=', '≤'], ['>', '>'], ['<', '<']];
  list.forEach((c, i) => {
    const row = h('div', { class: 'cond' }), ty = h('select', {}); for (const x of S.reg.storyConds) ty.append(h('option', { value: x.id }, x.name)); ty.value = c.k;
    const first = a => a[0]?.id ?? a[0]?.doc?.id;
    ty.onchange = () => { const k = ty.value; list[i] = k === 'var' ? { k, name: '' } : k === 'stage' ? { k, attr: 'knowledge', op: '>=', v: 1 } : k === 'ach' ? { k, id: first(S.reg.achievements) } : k === 'played' ? { k, id: first(S.story.segs) } : { k, op: '>=', v: 1 }; up(); }; row.append(ty);
    const opS = () => { const e = h('select', { class: 'op' }); for (const [v, n] of OPS) e.append(h('option', { value: v }, n)); e.value = c.op || '=='; e.onchange = () => { if (e.value === '==') delete c.op; else c.op = e.value; changed(); }; return e; };
    const vIn = (asNum) => { const e = h('input', { type: asNum ? 'number' : 'text', placeholder: asNum ? '数' : '不写 = 是真' }); e.value = c.v ?? ''; e.oninput = () => { if (e.value === '') delete c.v; else c.v = asNum ? Number(e.value) : parseVal(e.value); changed(); }; return e; };
    const yes = (a, b) => { const e = h('select', {}, h('option', { value: '' }, a), h('option', { value: 'no' }, b)); e.value = c.v === false ? 'no' : ''; e.onchange = () => { if (e.value) c.v = false; else delete c.v; changed(); }; return e; };
    if (c.k === 'var') { row.classList.add('wrap'); row.append(varName(() => c.name, v => { c.name = v; changed(); }), opS(), varVal(c.name, () => c.v ?? '', v => { if (v === '') delete c.v; else c.v = parseVal(v); changed(); }, '不写 = 是真')); }
    else if (c.k === 'stage') { const lv = h('select', {}, ...[['0', '没学'], ['1', '浅层'], ['2', '深层']].map(([v, n]) => h('option', { value: v }, n))); lv.value = String(c.v ?? 1); lv.onchange = () => { c.v = Number(lv.value); changed(); };
      row.append(sel(c, 'attr', S.reg.attrs.filter(a => !['intuition', 'confess', 'special'].includes(a.id)).map(a => [a.id, a.name])), opS(), lv); }
    else if (c.k === 'ach') row.append(sel(c, 'id', S.reg.achievements.map(a => [a.id, a.name])), yes('拿过', '没拿过'));
    else if (c.k === 'played') row.append(sel(c, 'id', S.story.segs.map(s => [s.doc.id, s.doc.name || s.doc.id])), yes('播过', '没播过'));
    else row.append(opS(), vIn(true));
    row.append(h('button', { class: 'mini', title: '删掉这个条件', onclick: () => { list.splice(i, 1); up(); } }, '✕')); box.append(row);
  });
  box.append(h('button', { class: 'mini', onclick: () => { list.push({ k: 'var', name: '' }); up(); } }, '＋ 加条件'));
  return box;
}
// 选节点的下拉：最后一项「＋ 新建一个节点」
function nodeSel(g, cur, onPick, none = '（不接，到这里结束）') {
  const e = h('select', { class: 'nsel' }, h('option', { value: '' }, none)); for (const n of g.nodes) e.append(h('option', { value: n.id }, n.name ? `${n.name}（${n.id}）` : n.id)); e.append(h('option', { value: '+' }, '＋ 新建一个节点'));
  e.value = cur || ''; e.onchange = () => { let v = e.value; if (v === '+') { v = newNode(g, S.sel?.node).id; toast('已新建节点 ' + v); } onPick(v || null); changed(); renderPanel(); };
  return e;
}

// 一个节点：长得像游戏里播出来的样子，点哪句改哪句。全屏对白、字幕、选项直接摆出来改，别的积木用夜间同款的积木行
function nodePanel(P) {
  const g = curSeg(), n = nodeOf(g, S.sel.node); if (!n) { S.sel = { kind: 'seg', seg: S.segFile }; return segPanel(P); }
  const start = (g.start || g.nodes[0]?.id) === n.id;
  P.append(hd('节点 · ' + (n.name || n.id), `剧情段「${g.name || g.id}」· 编号 ${n.id}${start ? ' · 从这里开始播' : ''}`, '积木'));
  P.append(acts(start ? null : ['▶ 设为开始节点', () => { g.start = n.id; if (g.nodes[0].id === n.id) delete g.start; changed(); renderPanel(); }],
    ['▶ 从这里预览', () => previewSeg(g, n.id)],
    g.nodes.length > 1 ? ['删除这个节点', () => { g.nodes.splice(g.nodes.indexOf(n), 1); if (g.start === n.id) delete g.start; S.sel = { kind: 'seg', seg: S.segFile }; changed(); renderPanel(); toast('已删除节点（Ctrl+Z 撤销）；连到它的路校验会报出来'); }, true] : null));
  const W = h('div', { class: 'chatwrap' }); P.append(W);
  W.append(h('div', { class: 'shname' }, ed({ ...fieldIO(n, 'name'), label: '节点名字', single: true, ph: '节点名字' })));
  const steps = n.steps || (n.steps = []);
  const ins = i => h('button', { class: 'fxins ' + (i === steps.length ? 'sadd' : 'sins'), title: i === steps.length ? '在最后加一块积木' : '在这里插一块积木', onclick: e => { e.stopPropagation(); blockMenu(e.currentTarget, nb => { steps.splice(i, 0, nb); S.openBlk = nb; S.newBlk = nb; changed(); keepPanel(); }, true); } }, i === steps.length ? '＋ 加一块积木' : '＋');
  steps.forEach((b, i) => { W.append(ins(i), stepRow(g, n, i)); });
  W.append(ins(steps.length));
  // 最后一条路是「走完接着 / 走完就结束」时，可以选接哪个节点；别的情况（跳转、结束、进结局、选项都连好了）由积木自己决定
  const last = outs(n).at(-1), open = last.k === 'next' || last.lbl === '走完就结束';
  W.append(h('div', { class: 'fin' + (open ? '' : ' end') }, h('div', { class: 'finhd' }, h('span', {}, '🏁 走完这些积木之后'),
    open ? nodeSel(g, n.next, v => { if (v) n.next = v; else delete n.next; }) : h('em', {}, '上面的积木已经决定往哪走了'))));
}
function stepRow(g, n, i) {
  const list = n.steps, b = list[i];
  const tools = () => h('span', { class: 'bact' }, h('button', { title: '上移', onclick: e => mv(-1, e) }, '↑'), h('button', { title: '下移', onclick: e => mv(1, e) }, '↓'),
    h('button', { title: '删除这块（可以撤销）', onclick: e => { e.stopPropagation(); list.splice(i, 1); changed(); keepPanel(); toast('已删除积木（Ctrl+Z 撤销）'); } }, '✕'));
  const mv = (d, e) => { e.stopPropagation(); const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); keepPanel(); };
  const isNew = S.newBlk === b; if (isNew) S.newBlk = null;
  if (b.do === 'say') {
    const c = charOf(b.who), col = c?.color || '#6E6E75';
    const who = h('select', { class: 'chipsel', style: `color:${col}` }, h('option', { value: '' }, '旁白'), ...S.story.chars.chars.map(x => h('option', { value: x.id }, x.name))); who.value = b.who || '';
    who.onchange = () => { if (who.value) b.who = who.value; else { delete b.who; delete b.face; delete b.pos; } changed(); keepPanel(); };
    const face = suggest(h('input', { class: 'chipsel chipin', placeholder: '表情（不写 = 默认）', title: '表情：有这个表情的立绘就换上；占位时用动作 + 头顶符号表示' }), () => ['', ...FACES]); face.value = b.face || '';
    face.oninput = () => { if (face.value) b.face = face.value; else delete b.face; changed(); };
    return h('div', { class: 'blk vn' + (isNew ? ' new' : ''), style: `--cc:${col}` },
      h('div', { class: 'bhd' }, h('span', { class: 'bic' }, '💬'), who, c ? face : null, c ? chip('站位', b, 'pos', [['center', '中'], ['left', '左'], ['right', '右']], { onchange: keepPanel }) : null, h('span', { class: 'sp' }), tools()),
      h('div', { class: 'vnbox' }, c ? h('span', { class: 'vnname', style: `background:${col}` }, c.name) : null, ed({ ...fieldIO(b, 'text'), label: c ? c.name + '的台词' : '旁白', ph: '点这里写台词', cls: 'vntext' + (c ? '' : ' narr') })),
      h('div', { class: 'vnalts' }, altsEd(b)));
  }
  if (b.do === 'caption') return h('div', { class: 'blk vn' + (isNew ? ' new' : '') }, h('div', { class: 'bhd' }, h('span', { class: 'bic' }, '🎬'), h('b', {}, '黑屏字幕'), h('span', { class: 'sp' }), tools()),
    h('div', { class: 'capbox' }, ed({ ...fieldIO(b, 'text'), label: '黑屏字幕', ph: '点这里写字幕（回车换行）' })), h('div', { class: 'vnalts' }, altsEd(b)));
  if (b.do === 'choice') {
    const opts = b.options || (b.options = []);
    return h('div', { class: 'blk vn' + (isNew ? ' new' : '') }, h('div', { class: 'bhd' }, h('span', { class: 'bic' }, '🔀'), h('b', {}, '选项'), h('span', { class: 'bsum' }, '玩家选一个；跳过停在这里'), tools()),
      h('div', { class: 'chbox' }, ed({ ...fieldIO(b, 'prompt'), label: '提问（选填）', ph: '提问（选填，显示在对话框里）', cls: 'narr' }),
        ...opts.map((o, k) => h('div', { class: 'chopt' }, h('span', { class: 'k' }, k + 1), ed({ ...fieldIO(o, 'text'), label: '选项文字', single: true, ph: '选项文字' }),
          h('span', { class: 't3' }, '→'), nodeSel(g, o.to, v => { if (v) o.to = v; else delete o.to; }, '（接着往下）'),
          setEd(o), opts.length > 2 ? h('button', { class: 'mini', title: '删掉这个选项', onclick: () => { opts.splice(k, 1); changed(); keepPanel(); } }, '✕') : null)),
        opts.length < 4 ? h('button', { class: 'mini', onclick: () => { opts.push({ text: '' }); changed(); keepPanel(); } }, '＋ 加一个选项') : null));
  }
  // 其余积木：和夜间演出同一个积木行（点开填参数）
  return blockRow(n, 'steps', i);
}
// 选项顺手设的剧情变量：写成「变量=值」，几个用逗号隔开
function setEd(o) {
  const e = h('input', { class: 'chipin', type: 'text', placeholder: '顺手设变量：如 态度=拼命', title: '选了这一项就把剧情变量设成这个值；几个用逗号隔开' });
  e.value = Object.entries(o.set || {}).map(([k, v]) => k + '=' + v).join(', ');
  const vs = [...storyVars().keys()]; if (vs.length) e.title += '\n已有的变量：' + vs.join('、');
  e.oninput = () => { const m = {}; for (const kv of e.value.split(/[,，]/)) { const [k, ...r] = kv.split('='); if (k.trim()) m[k.trim()] = parseVal(r.join('=').trim() || 'true'); } if (Object.keys(m).length) o.set = m; else delete o.set; changed(); };
  return e;
}

// 全部剧情段里用到过的剧情变量：名字 → 出现过的值、用在哪几段（设变量、选项顺手设、条件）
function storyVars() {
  const m = new Map(), add = (name, v, seg) => { if (!name) return; const x = m.get(name) || m.set(name, { vals: new Set(), segs: new Set() }).get(name); if (v !== undefined && v !== '') x.vals.add(String(v)); x.segs.add(seg); };
  const conds = (list, seg) => { for (const c of list || []) if (c.k === 'var') add(c.name, c.v, seg); };
  for (const { doc: g } of S.story.segs) {
    const nm = g.name || g.id; conds(g.when, nm);
    for (const n of g.nodes || []) for (const b of n.steps || []) {
      if (b.do === 'set') add(b.name, b.add != null && b.add !== '' ? '（数字）' : b.value ?? 'true', nm);
      if (b.do === 'choice') for (const o of b.options || []) for (const [k, v] of Object.entries(o.set || {})) add(k, v, nm);
      if (b.do === 'if') conds(b.when, nm);
    }
  }
  return m;
}
// 变量名：能直接打新名字，下面一排已有的变量点一下就填进去（鼠标停上去看值和用在哪）
function varName(get, set) {
  const vars = storyVars(), e = h('input', { type: 'text', placeholder: '写个新名字，或点下面已有的' }); e.value = get() || '';
  const box = h('div', { class: 'varpick' }, e), row = h('div', { class: 'chips' }), hint = h('em', { class: 'varnew' });
  const mark = () => { const v = e.value.trim(); row.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.v === v)); hint.textContent = v && !vars.has(v) ? '新变量：别的地方还没用过这个名字' : ''; };
  e.oninput = () => { set(e.value.trim()); mark(); };
  for (const [k, x] of vars) row.append(h('button', { class: 'chip', 'data-v': k, title: `值：${[...x.vals].join(' / ') || '是真'}\n用在：${[...x.segs].join('、')}`, onclick: () => { e.value = k; set(k); mark(); keepPanel(); } }, k, h('i', { class: 'varv' }, [...x.vals].join(' / ') || '是真')));
  if (vars.size) box.append(h('div', { class: 'note' }, '已有的变量（点一下用它）：'), row); else box.append(h('div', { class: 'note' }, '还没有剧情变量，写个名字就是新的一个'));
  box.append(hint); mark(); return box;
}
// 变量的值：可以打，也可以从这个变量出现过的值里选
function varVal(name, get, set, ph) {
  const vals = [...(storyVars().get(name)?.vals || [])].filter(v => v !== '（数字）');
  const e = suggest(h('input', { type: 'text', placeholder: ph }), ['true', 'false', ...vals]); e.value = get() ?? ''; e.oninput = () => set(e.value);
  return h('span', { class: 'varval' }, e);
}

function dayPanel(P) {
  const d = S.sched.days.find(x => x.day === S.sel.day); if (!d) { S.sel = null; return storyPanel(P); }
  P.append(hd(`第 ${d.day} 天`, '日程表 · 剧本/_日程表.json（这一天的安排；剧情里的改动只改这一局，不改这里）', '这一天'));
  const F = h('div', { class: 'form' }); P.append(F);
  if (d.event === 'tutorial') { F.append(h('div', { class: 'note' }, `Day 0 出厂测试（新手教学）：测试员「${userName(d.tutor)}」、场景 ${d.scene}、教学额度 ${d.quota}、解锁 ${(d.unlock || []).map(a => regAttr(a)?.name || a).join('、')}、教学题 ${d.question}。\n这一行和新手教学的代码绑在一起，要改直接改 JSON。`)); return; }
  F.append(h('div', { class: 'row' }, field('名字', txt(d, 'name', { ph: '选填，如「Boss 之夜」' })), field('当天行动点', num(d, 'ap', { step: 1 }))));
  F.append(h('div', { class: 'row' }, field('后训练每天最多', num(d, 'postPerDay', { step: 1 })), field('控盘额度', check(d, 'resetQuota', '这一天早上回满'))));
  const acts0 = d.activities || ['pretrain', 'posttrain', 'eat'];
  F.append(field('开放的白天活动', h('div', { class: 'chips' }, ...Object.entries(ACTN).map(([id, n]) => { const e = h('input', { type: 'checkbox' }); e.checked = acts0.includes(id);
    e.onchange = () => { d.activities = Object.keys(ACTN).filter(x => x === id ? e.checked : acts0.includes(x)); changed(); renderPanel(); }; return h('label', { class: 'ck' }, e, n); }))));
  const sl = d.slots || (d.slots = slotsOf(d)); delete d.visitors; delete d.fixed;
  const box = h('div', { class: 'box' }, h('b', {}, '来客位：夜里按顺序上线的用户（随机 = 从还有没来过的场景的用户里抽）'));
  sl.forEach((v, i) => {
    const us = h('select', {}, h('option', { value: '' }, '随机'), ...S.list.filter(u => !u.user.tutorial).map(u => h('option', { value: u.dir }, u.user.name + (u.user.boss ? '（Boss）' : '')))); us.value = v === 'random' ? '' : v.user;
    us.onchange = () => { sl[i] = us.value ? { user: us.value } : 'random'; changed(); renderPanel(); };
    const row = h('div', { class: 'slotrow' }, h('span', { class: 'sn' }, i + 1), us);
    if (v !== 'random') { const u = S.list.find(x => x.dir === v.user), ss = h('select', {}, h('option', { value: '' }, '下一个没用过的场景'), ...(u?.scenes || []).map(s => h('option', { value: s.file }, String(s.order).padStart(2, '0') + ' ' + s.title)));
      ss.value = v.scene || ''; ss.onchange = () => { if (ss.value) v.scene = ss.value; else delete v.scene; changed(); }; row.append(ss); }
    row.append(h('button', { class: 'mini', title: '删掉这一位', onclick: () => { sl.splice(i, 1); changed(); renderPanel(); } }, '✕')); box.append(row);
  });
  box.append(h('button', { class: 'mini', onclick: () => { sl.push('random'); changed(); renderPanel(); } }, '＋ 加一位来客'));
  F.append(box, field('备注', txt(d, 'note', { area: true, ph: '只给策划看' })));
  const last = Math.max(...S.sched.days.map(x => x.day));
  P.append(acts(d.day === last ? ['删除这一天', () => { S.sched.days.splice(S.sched.days.indexOf(d), 1); S.sel = null; changed(); renderPanel(); toast('已删除（Ctrl+Z 撤销）'); }, true, '只能从最后一天删起'] : null));
}
function startPanel(P) {
  const st = S.sched.start;
  P.append(hd('开局', '日程表 · 新游戏的出厂状态', '开局'));
  const F = h('div', { class: 'form' }); P.append(F);
  F.append(h('div', { class: 'row' }, field('心', num(st, 'hearts', { step: 1 })), field('心的上限', num(st, 'heartMax', { step: 1 }))),
    h('div', { class: 'row' }, field('控盘额度', num(st, 'quota', { step: 1 })), field('额度上限', num(st, 'quotaMax', { step: 1 }))),
    h('div', { class: 'row' }, field('回档次数', num(st, 'rollbacks', { step: 1 }), 'Demo 1、28 天 0'), field('心尽', check(st, 'heartsOutEnds', '心归零就结算这一局'))),
    h('div', { class: 'note' }, '出厂时的训练状态（哪些属性已经学了）写在 JSON 的 start.stage，和新手教学绑在一起，要改直接改 JSON。'));
}
function charPanel(P) {
  const c = charOf(S.sel.id); if (!c) { S.sel = null; return storyPanel(P); }
  P.append(hd('角色 · ' + c.name, `角色表 · 剧本/${CHARP} · 编号 ${c.id}`, '角色'));
  if (c.id === 'fish') P.append(h('div', { class: 'phint', style: 'margin:0 12px 8px' }, '这里是剧情画面里的立绘。游戏工位上那个会动的她在', h('button', { class: 'mini', style: 'margin-left:6px', onclick: () => storyGo('sprite') }, '🐟 工位动画 →')));
  const F = h('div', { class: 'form' }); P.append(F);
  const prev = h('div', { class: 'cprev' }, portraitImg(c, '默认', 'cpic big'));
  const color = h('input', { type: 'color' }); color.value = c.color || '#5AA0FF'; color.oninput = () => { c.color = color.value; changed(); };
  const tint = h('input', { type: 'range', min: 0, max: 359 }); tint.value = c.tint || 0; tint.oninput = () => { c.tint = +tint.value || undefined; if (!c.tint) delete c.tint; changed(); prev.replaceChildren(portraitImg(c, '默认', 'cpic big')); };
  F.append(h('div', { style: 'display:flex;gap:12px;align-items:flex-start' }, prev, h('div', { style: 'flex:1;display:flex;flex-direction:column;gap:8px' },
    field('名字', txt(c, 'name'), '名牌上显示'), field('名牌颜色', color), field('占位换色', tint, '没有立绘时，大肥鱼占位精灵转多少色相'))));
  const pt = c.portraits || (c.portraits = {}), box = h('div', { class: 'box' }, h('b', {}, '立绘：表情 → 图片（相对 剧本/_剧情/）。找不到某个表情就用「默认」，「默认」也没有就用占位'));
  for (const [f, src] of Object.entries(pt)) {
    const fi = suggest(h('input', { type: 'text' }), () => ['默认', ...FACES].filter(x => x === f || !(x in pt))); fi.value = f; fi.onchange = () => { const v = fi.value.trim(); if (!v || v === f) return; delete pt[f]; pt[v] = src; changed(); renderPanel(); };
    const si = h('input', { type: 'text' }); si.value = src; si.oninput = () => { pt[f] = si.value; changed(); };
    box.append(h('div', { class: 'slotrow' }, fi, si, h('button', { class: 'mini', onclick: () => pickFile('.png', async file => { pt[f] = await uploadStory(`立绘/${c.id}_${f}.png`, file); changed(); renderPanel(); toast('立绘已上传'); }) }, '上传…'),
      h('button', { class: 'mini', onclick: () => { delete pt[f]; changed(); renderPanel(); } }, '✕')));
  }
  box.append(h('button', { class: 'mini', onclick: () => { const f = Object.keys(pt).length ? FACES.find(x => !(x in pt)) || '新表情' : '默认'; pt[f] = ''; changed(); renderPanel(); } }, '＋ 加一个表情'));
  F.append(box);
  const used = S.story.segs.filter(s => JSON.stringify(s.doc.nodes).includes(`"who":"${c.id}"`));
  P.append(acts(used.length ? null : ['删除这个角色', () => { S.story.chars.chars.splice(S.story.chars.chars.indexOf(c), 1); S.sel = null; changed(); renderPanel(); }, true]));
}
// 上传到 剧本/_剧情/ 下，返回相对 _剧情/ 的路径
async function uploadStory(sub, file) {
  const b64 = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result.split(',')[1]); fr.readAsDataURL(file); });
  const r = await fetch('/api/upload?p=' + encodeURIComponent(SP + sub), { method: 'POST', body: b64 }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j.path.slice(SP.length);
}

// ---------- 剧情积木：新建时的默认值、画布上的一句话摘要、积木表单里的特殊参数 ----------
function newStoryBlock(id) {
  const d = SBLK(id), b = { do: id };
  for (const p of d.params) if (p.t === 'select' && !['mode', 'level', 'on'].includes(p.k)) b[p.k] = p.opts[0][0];
  ({ say: () => { b.text = ''; delete b.who; delete b.pos; }, caption: () => b.text = '', choice: () => b.options = [{ text: '' }, { text: '' }], if: () => b.when = [], stat: () => b.add = 1, visitor: () => { b.in = 0; b.slot = 1; },
    rig: () => { b.attr = 'intuition'; b.mode = 'hit'; }, fade: () => { b.to = 'out'; b.seconds = 0.8; }, set: () => { b.name = ''; b.value = ''; } }[id] || (() => { }))();
  return b;
}
function storySummary(b) {
  const cut = t => { t = (t || '').replace(/\n/g, ' '); return t.length > 26 ? t.slice(0, 26) + '…' : t; }, nn = id => { const n = nodeOf(curSeg() || { nodes: [] }, id); return n ? n.name || id : id || '（没选）'; };
  switch (b.do) {
    case 'say': return `${charOf(b.who)?.name || '旁白'}${b.face ? '（' + b.face + '）' : ''}：「${cut(b.text)}」`;
    case 'caption': return `「${cut(b.text)}」`;
    case 'picture': return b.src || '（占位插画）';
    case 'fade': return b.to === 'in' ? '从黑淡入' : '淡出到黑';
    case 'phone': return `${b.who || ''}：「${cut(b.text)}」`;
    case 'youSay': return `「${cut(b.text)}」`;
    case 'choice': return `${(b.options || []).length} 个选项：` + (b.options || []).map(o => o.text || '…').join(' / ');
    case 'if': return `${(b.when || []).length} 个条件 → ${nn(b.to)}${b.else ? '，否则 → ' + nn(b.else) : ''}`;
    case 'goto': return '→ ' + nn(b.to);
    case 'end': return '';
    case 'set': return b.add != null && b.add !== '' ? `${b.name} + ${b.add}` : `${b.name} = ${b.value === '' || b.value == null ? '真' : b.value}`;
    case 'stat': return `${{ hearts: '心', quota: '额度', ap: '行动点', rollbacks: '回档次数' }[b.k] || b.k} ${b.set != null && b.set !== '' ? '设成 ' + b.set : (b.add > 0 ? '+' : '') + (b.add ?? 0)}`;
    case 'corpus': return `${regAttr(b.attr)?.name || b.attr} → ${b.level == 2 ? '深层' : b.level == 1 ? '浅层' : '再学一层'}`;
    case 'activity': return `${ACTN[b.act] || b.act}：${b.on === false || b.on === 'false' ? '关掉' : '开放'}`;
    case 'visitor': return `${b.day ? '第 ' + b.day + ' 天' : ['今晚', '明晚'][b.in || 0] || b.in + ' 天后'}第 ${b.slot || 1} 位 → ${b.user ? userName(b.user) : '随机'}`;
    case 'rig': return `${b.slot ? (b.day ? '第 ' + b.day + ' 天' : ['今晚', '明晚'][b.in || 0] || b.in + ' 天后') + '第 ' + b.slot + ' 位' + (b.round ? '第 ' + b.round + ' 轮' : '') : '下一次转盘'} ${b.mode === 'miss' ? '必不停' : '必停'}「${(SBLK('rig').params.find(p => p.k === 'attr').opts.find(o => o[0] === b.attr) || [, b.attr])[1]}」`;
    case 'ach': return regName('achievements', b.id);
    case 'ending': return endName(b.id);
  }
  return '';
}
// 积木表单里剧情才有的参数类型
function storyParam(b, p, up) {
  const opt = (list, none) => { const e = h('select', {}); if (none) e.append(h('option', { value: '' }, none)); for (const [v, n] of list) e.append(h('option', { value: v }, n)); e.value = b[p.k] ?? ''; e.onchange = () => { if (e.value === '') delete b[p.k]; else b[p.k] = e.value; up(); }; return e; };
  if (p.t === 'char') return opt(S.story.chars.chars.map(c => [c.id, c.name]), '（不选）');
  if (p.t === 'user') return opt(S.list.filter(u => !u.user.tutorial).map(u => [u.dir, u.user.name]), '随机');
  if (p.t === 'ach') return opt(b.do === 'ending' ? [['hearts', '心尽'], ...S.reg.achievements.filter(a => a.ending).map(a => [a.id, a.name])] : S.reg.achievements.map(a => [a.id, a.name]), '（选一个）');
  if (p.t === 'node') { const g = curSeg(); return nodeSel(g, b[p.k], v => { if (v) b[p.k] = v; else delete b[p.k]; }, p.k === 'else' ? '（不满足就接着往下）' : '（没选）'); }
  if (p.t === 'conds') return condsEd(b, p.k);
  if (b.do === 'set' && p.k === 'name') return varName(() => b.name, v => { b.name = v; up(); });
  if (b.do === 'set' && p.k === 'value') return varVal(b.name, () => b.value, v => { if (v === '') delete b.value; else b.value = v; up(); }, '不写 = 是真');
  if (p.t === 'image') { const e = h('input', { type: 'text', placeholder: '如 插画/机房.png（还没有图就先写路径）' }); e.value = b[p.k] || ''; e.oninput = () => { b[p.k] = e.value; up(); };
    return h('div', { class: 'say' }, e, h('button', { class: 'mini', onclick: () => pickFile('.png,.jpg', async f => { b[p.k] = await uploadStory('插画/' + f.name, f); up(); keepPanel(); toast('已上传'); }) }, '上传…')); }
  if (p.t === 'number') { const e = h('input', { type: 'number', step: '1' }); e.value = b[p.k] ?? ''; e.oninput = () => { if (e.value === '') delete b[p.k]; else { const v = parseFloat(e.value); if (!isNaN(v)) b[p.k] = v; } up(); }; return e; }
  if (p.t === 'select' && p.k === 'level') return opt(p.opts.filter(o => o[0] !== ''), '再学一层');
  if (p.t === 'select' && ['mode', 'on'].includes(p.k)) return opt(p.opts, null);
  return null;
}

// ---------- 迷你预览：从某个节点一路播下去（选项取第一个，条件按「满足」走） ----------
async function previewSeg(g, from) {
  const ov = $('#fxpv'); ov.classList.add('on'); ov.querySelector('.pvt').textContent = '预览 · ' + (g.name || g.id);
  const box = ov.querySelector('.pvchat'); box.replaceChildren(); const my = ++PVR, alive = () => my === PVR;
  let id = from || g.start || g.nodes[0]?.id, guard = 0;
  while (id && alive() && guard++ < 40) {
    const n = nodeOf(g, id); if (!n) break; box.append(h('div', { class: 'mtag show' }, '▸ 节点「' + (n.name || n.id) + '」'));
    let next = n.next;
    for (const b of n.steps || []) {
      if (!alive()) return;
      if (b.do === 'choice') { box.append(h('div', { class: 'mtag' }, '🔀 选项：' + (b.options || []).map((o, k) => (k ? '' : '【') + (o.text || '…') + (k ? '' : '】')).join(' / '))); if (b.options?.[0]?.to) { next = b.options[0].to; break; } continue; }
      if (b.do === 'if') { if (b.to) { next = b.to; box.append(h('div', { class: 'mtag' }, '❓ 条件（预览按满足走）')); break; } continue; }
      if (b.do === 'goto') { next = b.to; break; }
      if (b.do === 'end' || b.do === 'ending') { next = null; box.append(h('div', { class: 'mtag' }, b.do === 'ending' ? '🏁 进结局：' + endName(b.id) : '⏹ 结束这一段')); break; }
      await miniBlock(b, 1, 1, box, alive, 0);
    }
    id = next;
  }
  if (alive()) box.append(h('div', { class: 'pvend' }, '— 播完了 · 全屏画面在这里只用文字示意 —')); box.scrollTop = box.scrollHeight;
}
// 迷你预览里剧情积木的样子（miniBlock 碰到剧情积木转过来）
async function storyMini(b, add) {
  const c = charOf(b.who);
  if (b.do === 'say') { const el = add(h('div', { class: 'ma vnm' }, c ? h('b', { style: `color:${c.color}` }, c.name + '：') : null, '')); const t = b.text || ''; for (let k = 0; k < t.length; k++) { el.lastChild.textContent = t.slice(0, k + 1); await sleep(18); } await sleep(200); return; }
  if (b.do === 'caption') { add(h('div', { class: 'mcap' }, b.text || '')); await sleep(400); return; }
  if (b.do === 'youSay') { add(h('div', { class: 'mu' }, '🧠 ' + (b.text || ''))); await sleep(250); return; }
  const d = SBLK(b.do); add(h('div', { class: 'mtag' }, (d?.icon || '') + ' ' + (d?.name || b.do) + ' ' + storySummary(b))); await sleep(200);
}

// ---------- 校验（剧情这一半） ----------
function validateStory() {
  const out = [], R = S.reg, add = (lv, msg, target) => { if (!out.some(o => o.msg === msg)) out.push({ lv, msg, target }); };
  const VN = new Set(['say', 'caption', 'picture', 'fade', 'choice']), TXT = new Set(['say', 'caption', 'youSay', 'phone']);
  const ids = new Map(), chars = new Set();
  for (const c of S.story.chars.chars) { if (chars.has(c.id)) add('err', `角色表：编号「${c.id}」重复`, { kind: 'char', id: c.id }); chars.add(c.id); if (!c.name) add('warn', `角色表：「${c.id}」没写名字`, { kind: 'char', id: c.id }); }
  for (const d of S.sched.days) { if (d.event === 'tutorial') continue; const T = { kind: 'day', day: d.day };
    if (!slotsOf(d).length) add('warn', `日程表 · 第 ${d.day} 天：一位来客都没有`, T);
    slotsOf(d).forEach((v, i) => { if (v === 'random') return; const u = S.list.find(x => x.dir === v.user); if (!u) add('err', `日程表 · 第 ${d.day} 天第 ${i + 1} 位：剧本库里没有用户「${v.user}」`, T); else if (v.scene && !u.scenes.some(s => s.file === v.scene)) add('err', `日程表 · 第 ${d.day} 天第 ${i + 1} 位：「${u.user.name}」没有场景「${v.scene}」`, T); }); }
  for (const s of S.story.segs) {
    const g = s.doc, nm = `「${g.name || s.file}」`, SG = { kind: 'seg', seg: s.file }, hk = SHOOK(g.hook?.at);
    if (!g.id) add('err', nm + '：没有编号 id', SG); else if (ids.has(g.id)) add('err', nm + `：编号「${g.id}」和「${ids.get(g.id)}」重复`, SG); else ids.set(g.id, g.name || s.file);
    if (!hk) add('err', nm + `：挂点「${g.hook?.at || ''}」不在登记表里`, SG);
    if (g.now && hk?.cat !== '事件') add('warn', nm + '：只有事件挂点能勾「立即」', SG);
    for (const c of g.when || []) if (!R.storyConds.some(x => x.id === c.k)) add('err', nm + `：进入条件「${c.k}」不认得`, SG); else if (c.k === 'var' && !c.name) add('err', nm + '：进入条件里有一个剧情变量没写名字', SG);
    if (!g.nodes?.length) { add('err', nm + '：一个节点都没有', SG); continue; }
    const nodes = new Set(g.nodes.map(n => n.id)), start = g.start || g.nodes[0].id;
    if (g.start && !nodes.has(g.start)) add('err', nm + `：开始节点「${g.start}」不存在`, SG);
    const reach = new Set([start]), q = [start]; while (q.length) { const n = nodeOf(g, q.shift()); if (!n) continue; for (const o of outs(n)) if (o.to && nodes.has(o.to) && !reach.has(o.to)) { reach.add(o.to); q.push(o.to); } }
    for (const n of g.nodes) {
      const NT = { kind: 'node', seg: s.file, node: n.id }, w = nm + ' · ' + (n.name || n.id);
      if (!reach.has(n.id)) add('warn', w + '：从开始节点走不到这里', NT);
      if (!(n.steps || []).length) add('info', w + '：还没有积木', NT);
      for (const o of outs(n)) if (o.to && !nodes.has(o.to)) add('err', w + `：${o.lbl} 连到了不存在的节点「${o.to}」`, NT); else if (!o.end && !o.to && o.k !== 'if') add('err', w + `：「${o.lbl}」还没连到节点`, NT);
      (n.steps || []).forEach((b, i) => {
        const x = w + ` 第 ${i + 1} 块`, d = BLK(b.do);
        if (!d) return add('err', x + `：积木「${b.do}」不在积木库里`, NT);
        if (TXT.has(b.do) && !b.text) add('warn', x + `：「${d.name}」没写文字`, NT);
        if (b.alts?.some(t => !t)) add('warn', x + `：「${d.name}」有一种说法是空的`, NT);
        if (b.do === 'say' && b.who && !chars.has(b.who)) add('err', x + `：角色「${b.who}」不在角色表里`, NT);
        if (b.do === 'choice') { const os = b.options || []; if (os.length < 2 || os.length > 4) add('err', x + '：选项要 2–4 个', NT); if (os.some(o => !o.text)) add('err', x + '：有选项没写文字', NT); }
        if (b.do === 'if' && !(b.when || []).length) add('warn', x + '：条件跳转没写条件（永远算满足）', NT);
        if (b.do === 'if' && !b.to) add('err', x + '：条件跳转没选满足时跳到哪', NT);
        if (b.do === 'set' && !b.name) add('err', x + '：设剧情变量没写变量名', NT);
        if (b.do === 'visitor' && b.user && !S.list.some(u => u.dir === b.user)) add('err', x + `：剧本库里没有用户「${b.user}」`, NT);
        if ((b.do === 'ach' || b.do === 'ending') && b.id !== 'hearts' && !R.achievements.some(a => a.id === b.id && (b.do === 'ach' || a.ending))) add('err', x + `：${b.do === 'ending' ? '结局' : '成就'}「${b.id || ''}」没登记（要在登记表 achievements 里${b.do === 'ending' ? '，带 ending: true' : ''}）`, NT);
        if (b.do === 'show' && !S.lib.shows.some(z => z.id === b.id)) add('err', x + `：共享演出「${b.id}」不存在`, NT);
        if (g.now && VN.has(b.do)) add('err', x + `：勾了「立即」的剧情段不能用「${d.name}」（对话中间只能演窗口里的事）`, NT);
      });
    }
  }
  return out;
}
function storyFocus(t) {
  const el = t.kind === 'node' ? $(`.snode[data-node="${CSS.escape(t.node)}"]`) : t.kind === 'day' ? [...document.querySelectorAll('.tlhd')].find(x => x.textContent.startsWith(`第 ${t.day} 天`)) : t.kind === 'char' ? $('.charc.sel') : null;
  if (!el) return; const lane = $('#lane').getBoundingClientRect(), r = el.getBoundingClientRect(); V.x += lane.left + lane.width / 2 - (r.left + r.right) / 2; V.y += lane.top + 100 - r.top; applyView();
}

// ---------- 说明 ----------
function storyHelp() {
  const d = $('#help .dlg'); if (!S.nightHelp) S.nightHelp = [...d.childNodes];
  d.replaceChildren(h('button', { class: 'x', onclick: () => $('#help').classList.remove('on') }, '关闭 Esc'), h('h2', {}, '剧情模块怎么用'),
    h('p', { class: 't2' }, '这一半管「游戏剧情」：大肥鱼这 28 天里，夜间对话之外发生的事。规则全文在「文档/策划/游戏剧情_设计.md」。'),
    h('h3', {}, '日程表'), h('p', {}, '一列是一天：这一天的行动点、开放的活动、夜里的来客位，以及每个挂点（早上开工前、营业前、第几位用户上线前……）挂了哪些剧情。点格子里的剧情打开它，点 ＋ 在那个时刻新建一段。灰色带「每天」的剧情是每天都会播的。最左是开场，最右是事件和结局。'),
    h('h3', {}, '剧情段'), h('p', {}, '一段剧情是几个节点连起来的图：从「▶ 开始」那个节点播起，节点里的积木从上往下播，碰到选项、条件跳转就分叉。节点底下的每一行是一条往外的路，连线连到下一个节点。拖节点标题可以挪位置。'),
    h('p', {}, '点节点，右边就是它的积木：全屏对白、黑屏字幕、选项直接点文字改；别的积木点开填参数。积木之间的 ＋ 可以插新积木。「⚙ 什么时候播」改这一段挂在哪、哪一天、什么条件、播几次。'),
    h('h3', {}, '角色表'), h('p', {}, '剧情里说话的角色。没有立绘的先用大肥鱼的占位精灵，换个颜色好分清；美术交图以后在角色里加「表情 → 图片」，剧情不用改。'),
    h('h3', {}, '剧情杀'), h('p', {}, '「剧情杀」积木给之后的某一转下暗箱：必停或必不停某类卡。不给玩家任何提示，抹除、剔除重转按了也没反应。'));
  $('#help').classList.add('on');
}
function storyHelpRestore() { if (S.nightHelp) { $('#help .dlg').replaceChildren(...S.nightHelp); S.nightHelp = null; } }
