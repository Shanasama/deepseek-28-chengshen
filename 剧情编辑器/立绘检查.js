// 剧情模块 →「工位动画」：查合伙人交来的大肥鱼逐帧动画，叠在真实工位里播，没问题就装进游戏。
// 规则和读法跟游戏共用 游戏/js/立绘读取.js；预览是把游戏放进 iframe（?立绘预览=day），用 postMessage 送帧过去。
// 对接说明：工位立绘接口.md §6。
const SPR = { acts: {}, src: {}, warn: [], gifs: [], origs: [], sel: 'idle', mode: 'day', guides: true, ready: false, R: null };
const SRP = import('/游戏/js/立绘读取.js');
let SPRBOX = null;   // 整页只建一次：重画剧情模块时挪回来就行（iframe 会重新载入，载好了再把帧送一遍）

function spriteCanvas(lane) {
  if (!SPRBOX) SPRBOX = sprBuild();
  lane.append(SPRBOX); SRP.then(R => { SPR.R = R; sprDraw(); });
}
function sprBuild() {
  const fileIn = h('input', { type: 'file', multiple: true, accept: '.png,.json,.txt,.gif,.aseprite', style: 'display:none', onchange: e => sprFiles([...e.target.files].map(f => ({ path: f.name, file: f }))) });
  const dirIn = h('input', { type: 'file', webkitdirectory: true, style: 'display:none', onchange: e => sprFiles([...e.target.files].map(f => ({ path: f.webkitRelativePath.split('/').slice(1).join('/') || f.name, file: f }))) });
  const frame = h('iframe', { class: 'sprgame', src: '/游戏/?立绘预览=day', title: '真实工位预览' });
  const box = h('div', { class: 'sprchk nopan', ondragover: e => { e.preventDefault(); box.classList.add('drop'); }, ondragleave: () => box.classList.remove('drop'), ondrop: e => { e.preventDefault(); box.classList.remove('drop'); sprDrop(e.dataTransfer); } },
    h('div', { class: 'sprbar' },
      h('button', { class: 'mini', title: '游戏现在用的：游戏/素材/大肥鱼/', onclick: () => sprDir('/游戏/素材/大肥鱼/', '游戏里') }, '读游戏里现在的'),
      h('button', { class: 'mini', title: '游戏/素材/大肥鱼/样稿/', onclick: () => sprDir('/游戏/素材/大肥鱼/样稿/', '样稿') }, '读样稿'),
      h('button', { class: 'mini', onclick: () => fileIn.click() }, '选文件…'), h('button', { class: 'mini', onclick: () => dirIn.click() }, '选文件夹…'), fileIn, dirIn,
      h('span', { class: 'sp' }),
      h('button', { class: 'mini', title: '120×120，倍率 2（现在用的）', onclick: () => sprTemplate(2) }, '⬇ 出图模板'),
      h('button', { class: 'mini', title: '240×240，倍率 1（以后出高精度版用）', onclick: () => sprTemplate(1) }, '⬇ 模板（倍率 1）'),
      h('button', { class: 'mini sprinst', onclick: sprInstall }, '装进游戏')),
    h('div', { class: 'sprmain' }, h('div', { class: 'sprleft' }), h('div', { class: 'sprright' }, frame, h('div', { class: 'sprctl' }), h('div', { class: 'sprstrip' }))));
  addEventListener('message', e => { if (e.source === frame.contentWindow && e.data?.type === '立绘就绪') { SPR.ready = true; sprSend(); } });
  return box;
}
const sprFrame = () => SPRBOX?.querySelector('.sprgame').contentWindow;
const sprPost = m => SPR.ready && sprFrame()?.postMessage(m, location.origin);
async function sprSend() {
  const acts = {}; for (const [k, fs] of Object.entries(SPR.acts)) acts[k] = await Promise.all(fs.map(async f => ({ bmp: await createImageBitmap(f.c), ms: f.ms })));
  sprPost({ type: '立绘', acts }); sprPost({ type: '模式', mode: SPR.mode }); sprPost({ type: '参考线', on: SPR.guides }); sprPost({ type: '动作', act: SPR.sel });
}

// ---------- 读 ----------
const sprImg = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
function sprMerge(got, label) {
  for (const [k, fs] of Object.entries(got.acts || {})) { SPR.acts[k] = fs; SPR.src[k] = label; }
  SPR.warn.push(...(got.warn || []).map(w => label + '：' + w));
  if (!SPR.acts[SPR.sel]) SPR.sel = Object.keys(SPR.acts)[0] || 'idle';
}
async function sprDir(dir, label) {
  const R = await SRP, j = await fetch(dir + '大肥鱼.json?t=' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null); let got = null;
  if (j) { const s = await sprImg(dir + encodeURIComponent(R.asepriteImage(j)) + '?t=' + Date.now()); got = s ? R.parseAseprite(j, s) : { warn: ['图片「' + R.asepriteImage(j) + '」找不到'] }; }
  else { const t = await fetch(dir + '时长.txt?t=' + Date.now()).then(r => r.ok ? r.text() : null).catch(() => null); if (t != null) got = await R.parseFolder(t, p => sprImg(dir + p)); }
  if (!got || !Object.keys(got.acts || {}).length) return toast(label + '：一张帧都没有（' + dir + '）');
  sprMerge(got, label); toast('读进来了：' + Object.keys(got.acts).join('、')); sprChanged();
}
// 拖进来的文件夹要一层层展开
async function sprDrop(dt) {
  const out = [], walk = async (en, pre) => {
    if (en.isFile) return new Promise(ok => en.file(f => { out.push({ path: pre + f.name, file: f }); ok(); }, ok));
    const rd = en.createReader(); let batch; do { batch = await new Promise(ok => rd.readEntries(ok, () => ok([]))); for (const c of batch) await walk(c, pre + en.name + '/'); } while (batch.length);
  };
  const ens = [...dt.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!ens.length) return sprFiles([...dt.files].map(f => ({ path: f.name, file: f })));
  for (const en of ens) await walk(en, ''); // 拖的是一个文件夹时去掉最外层那一级
  const tops = new Set(out.map(o => o.path.split('/')[0])); sprFiles(tops.size === 1 && out.every(o => o.path.includes('/')) ? out.map(o => ({ ...o, path: o.path.split('/').slice(1).join('/') })) : out);
}
async function sprFiles(list) {
  const R = await SRP, by = p => list.find(o => o.path.toLowerCase() === p.toLowerCase() || o.path.toLowerCase().endsWith('/' + p.toLowerCase()));
  const asImg = async o => o ? sprImg(URL.createObjectURL(o.file)) : null, names = [];
  for (const o of list.filter(o => /\.json$/i.test(o.path))) {
    let j; try { j = JSON.parse(await o.file.text()); } catch { SPR.warn.push(o.path + '：不是合法的 JSON'); continue; }
    if (!j.frames) continue; const s = await asImg(by(R.asepriteImage(j)));
    if (!s) { SPR.warn.push(o.path + '：写的图片「' + R.asepriteImage(j) + '」没一起拖进来'); continue; }
    sprMerge(R.parseAseprite(j, s), o.path); names.push(o.path);
  }
  const txt = list.find(o => /(^|\/)时长\.txt$/.test(o.path)), covered = new Set();
  if (txt) { const pre = txt.path.slice(0, -'时长.txt'.length); const got = await R.parseFolder(await txt.file.text(), p => { covered.add(pre + p.split('/')[0]); return asImg(by(pre + p)); }); sprMerge(got, '时长.txt'); names.push('时长.txt'); }
  // 没有时长.txt 的「动作名/01.png」：每帧 130 毫秒
  const loose = new Map(); for (const o of list) { const m = o.path.match(/(?:^|\/)([A-Za-z]+)\/(\d+)\.png$/); if (!m || covered.has(o.path.slice(0, o.path.lastIndexOf('/')))) continue; (loose.get(m[1].toLowerCase()) || loose.set(m[1].toLowerCase(), []).get(m[1].toLowerCase())).push([+m[2], o]); }
  for (const [k, arr] of loose) { if (txt && SPR.acts[k]) continue; const fs = []; for (const [, o] of arr.sort((a, b) => a[0] - b[0])) { const i = await asImg(o); if (i) { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); fs.push({ c, ms: R.DEF_MS }); } } sprMerge({ acts: { [k]: fs }, warn: ['没有 时长.txt，按每帧 130 毫秒'] }, k + '/'); names.push(k + '/'); }
  for (const o of list.filter(o => /\.gif$/i.test(o.path))) {
    if (!window.ImageDecoder) { SPR.warn.push('这个浏览器读不了 GIF（要 Chrome / Edge）'); break; }
    try { const g = await R.parseGif(o.file), k = o.path.split('/').pop().replace(/\.gif$/i, '').toLowerCase(); SPR.warn.push(...g.warn.map(w => o.path + '：' + w));
      if (R.ACTS.includes(k)) sprMerge({ acts: { [k]: g.frames } }, o.path); else SPR.gifs.push({ name: o.path, frames: g.frames }); names.push(o.path);
    } catch (e) { SPR.warn.push(o.path + '：GIF 读不出来（' + e.message + '）'); }
  }
  for (const o of list.filter(o => /\.aseprite$/i.test(o.path))) { SPR.origs.push(o.file); names.push(o.path); }
  toast(names.length ? '读进来了：' + names.join('、') : SPR.warn.length ? '没读进来：看左边的提示' : '没认出能用的文件（要 大肥鱼.json+png、时长.txt+动作名/01.png，或 GIF）'); sprChanged();
}
function sprChanged() { sprDraw(); sprSend(); }

// ---------- 画 ----------
function sprDraw() {
  const R = SPR.R; if (!R || !SPRBOX) return;
  const ck = R.checkSprite(SPR.acts), L = SPRBOX.querySelector('.sprleft'); L.replaceChildren();
  const total = fs => fs.reduce((s, f) => s + f.ms, 0), has = Object.keys(SPR.acts).length;
  if (!has && !SPR.gifs.length) L.append(h('div', { class: 'sprdrop' }, h('b', {}, '把合伙人交的文件拖到这里'), h('div', { class: 'note' }, '大肥鱼.png + 大肥鱼.json（Aseprite 导出）、整个文件夹（动作名/01.png + 时长.txt），或 GIF 样稿。也可以先点上面「读游戏里现在的」。')));
  for (const g of SPR.gifs) {   // 文件名认不出动作的 GIF：问一下是哪个动作
    const s = h('select', {}, h('option', { value: '' }, '这是哪个动作？'), ...R.ACTS.map(k => h('option', { value: k }, `${R.ACT_NAME[k]}（${k}）`)));
    s.onchange = () => { if (!s.value) return; sprMerge({ acts: { [s.value]: g.frames } }, g.name); SPR.gifs.splice(SPR.gifs.indexOf(g), 1); SPR.sel = s.value; sprChanged(); };
    L.append(h('div', { class: 'sprgif' }, h('span', {}, '🎞 ' + g.name + ' · ' + g.frames.length + ' 帧'), s));
  }
  const list = h('div', { class: 'sprlist' }); L.append(list);
  for (const k of [...R.ACTS, ...Object.keys(SPR.acts).filter(k => !R.ACTS.includes(k))]) {
    const fs = SPR.acts[k], known = R.ACTS.includes(k), once = R.ONCE.has(k);
    const why = fs ? `${fs.length} 帧 · ${(total(fs) / 1000).toFixed(2)} 秒` : SPR.acts.idle ? '没交 · 用待机顶上' : '没交 · 用占位图';
    list.append(h('div', { class: 'sprrow' + (SPR.sel === k ? ' on' : '') + (fs ? '' : ' miss') + (known ? '' : ' bad'), title: known ? (once ? '播一次，播完回待机' : '循环') : '游戏不认这个名字', onclick: () => { SPR.sel = k; sprDraw(); sprPost({ type: '动作', act: k }); } },
      h('span', { class: 'sprn' }, known ? R.ACT_NAME[k] : '？'), h('code', {}, k), h('span', { class: 'sprw' }, why), h('span', { class: 'sprtag' }, once ? '一次' : '循环'),
      fs ? h('span', { class: 'sprsrc', title: '从哪读进来的' }, SPR.src[k] || '') : null,
      fs ? h('button', { class: 'mini', title: '去掉这个动作（装进游戏时就没有它）', onclick: e => { e.stopPropagation(); delete SPR.acts[k]; delete SPR.src[k]; sprChanged(); } }, '✕') : null));
  }
  const warn = [...SPR.warn, ...ck.warn];
  if (has || warn.length) L.append(h('div', { class: 'phint' + (warn.length ? '' : ' ok') }, h('b', {}, warn.length ? `要看一下的（${warn.length}）` : '都没问题'),
    ...warn.map(w => h('div', {}, '· ' + w)),
    ck.info.offPalette?.length ? h('div', { class: 'sprpal', title: '用得最多的几种调色板外的颜色' }, ...ck.info.offPalette.slice(0, 16).map(([c]) => h('i', { style: 'background:' + c, title: c }))) : null,
    warn.length ? h('button', { class: 'mini', onclick: () => { SPR.warn = []; sprDraw(); } }, '清掉读文件时的提示') : null));
  // 头像：idle 第 1 帧按头像框裁
  const av = document.createElement('canvas'); av.width = 24; av.height = 24; const ax = av.getContext('2d'); ax.fillStyle = '#C9ECFF'; ax.fillRect(0, 0, 24, 24);
  const f0 = SPR.acts.idle?.[0], k2 = ck.info.scale === 1 ? 2 : 1; if (f0) ax.drawImage(f0.c, R.AVA.x * k2, R.AVA.y * k2, R.AVA.s * k2, R.AVA.s * k2, 0, 0, 24, 24);
  L.append(h('div', { class: 'spravatar' }, av, h('div', { class: 'note' }, f0 ? '对话栏的小头像：从待机第 1 帧按头像框（黄框）裁。脸要在框里。' : '没有待机（idle），头像先用占位图。')));
  sprCtl(); sprStrip();
}
function sprCtl() {
  const C = SPRBOX.querySelector('.sprctl'), R = SPR.R;
  const mode = m => h('button', { class: 'chip' + (SPR.mode === m ? ' on' : ''), onclick: () => { SPR.mode = m; sprPost({ type: '模式', mode: m }); sprCtl(); } }, m === 'day' ? '☀ 白天' : '🌙 夜里');
  C.replaceChildren(mode('day'), mode('night'),
    h('label', { class: 'sprchk1' }, h('input', { type: 'checkbox', checked: SPR.guides, onchange: e => { SPR.guides = e.target.checked; sprPost({ type: '参考线', on: SPR.guides }); } }), '参考线（桌面线、头顶留空、头像框）'),
    h('span', { class: 'sp' }),
    h('button', { class: 'mini', title: '再播一遍（播一次的动作播完会回待机）', onclick: () => sprPost({ type: '动作', act: SPR.sel }) }, '▶ 再播「' + (R.ACT_NAME[SPR.sel] || SPR.sel) + '」'));
}
// 这个动作的每一帧，原大 ×2，下面写毫秒
function sprStrip() {
  const S2 = SPRBOX.querySelector('.sprstrip'), fs = SPR.acts[SPR.sel] || []; S2.replaceChildren();
  if (!fs.length) return S2.append(h('div', { class: 'note' }, '「' + (SPR.R.ACT_NAME[SPR.sel] || SPR.sel) + '」还没有帧。'));
  fs.forEach((f, i) => { const c = document.createElement('canvas'); c.width = f.c.width; c.height = f.c.height; c.getContext('2d').drawImage(f.c, 0, 0); c.style.width = f.c.width * 2 + 'px'; S2.append(h('div', { class: 'sprf' }, c, h('span', {}, `${i + 1} · ${f.ms} 毫秒`))); });
}

// ---------- 模板、装进游戏 ----------
async function sprTemplate(scale) {
  const R = await SRP, n = 120 * (3 - scale), c = document.createElement('canvas'); c.width = n; c.height = n; R.drawTemplate(c.getContext('2d'), scale);
  const a = h('a', { href: c.toDataURL('image/png'), download: scale === 2 ? '模板.png' : '模板_倍率1.png' }); document.body.append(a); a.click(); a.remove();
}
// 拼成一张 Aseprite 格式的图（每个动作一个 tag），写进 游戏/素材/大肥鱼/；原来的文件服务器会挪进 _旧/
async function sprInstall() {
  const R = SPR.R, ck = R.checkSprite(SPR.acts), names = R.ACTS.filter(k => SPR.acts[k]);
  if (!names.length) return toast('还没有能装的动作');
  const all = names.flatMap(k => SPR.acts[k]), { w, h: H } = ck.info;
  if (!R.BASE[w] || w !== H || all.some(f => f.c.width !== w || f.c.height !== H)) return toast('画布不对（要每帧都是 120×120 或 240×240），装进去会错位');
  const skip = Object.keys(SPR.acts).filter(k => !R.ACTS.includes(k));
  if (!await confirmBox('装进游戏？', [`动作：${names.map(k => R.ACT_NAME[k]).join('、')}`, '写入 游戏/素材/大肥鱼/大肥鱼.png 和 大肥鱼.json' + (SPR.origs.length ? '，以及 ' + SPR.origs.map(f => f.name).join('、') : ''), '原来的文件会挪进 _旧/，不会丢。', ...(skip.length ? ['游戏不认的动作不装：' + skip.join('、')] : [])], '装进游戏')) return;
  const cols = Math.min(all.length, 16), sheet = document.createElement('canvas'); sheet.width = cols * w; sheet.height = Math.ceil(all.length / cols) * H;
  const sx = sheet.getContext('2d'), frames = [], tags = []; let i = 0;
  for (const k of names) { const from = i; for (const f of SPR.acts[k]) { const x = (i % cols) * w, y = Math.floor(i / cols) * H; sx.drawImage(f.c, x, y); frames.push({ filename: `大肥鱼 ${i}.aseprite`, frame: { x, y, w, h: H }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h: H }, sourceSize: { w, h: H }, duration: f.ms }); i++; } tags.push({ name: k, from, to: i - 1, direction: 'forward' }); }
  const json = { frames, meta: { app: '大肥鱼编辑器「工位动画」装进游戏（' + new Date().toLocaleString() + '）', image: '大肥鱼.png', format: 'RGBA8888', size: { w: sheet.width, h: sheet.height }, scale: '1', frameTags: tags } };
  const put = async (f, body) => { const r = await fetch('/api/sprite?f=' + encodeURIComponent(f), { method: 'PUT', body }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
  const b64 = async blob => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let k = 0; k < u.length; k += 32768) s += String.fromCharCode(...u.subarray(k, k + 32768)); return btoa(s); };
  try {
    await put('大肥鱼.png', sheet.toDataURL('image/png').split(',')[1]); await put('大肥鱼.json', JSON.stringify(json, null, 1));
    for (const f of SPR.origs) await put(f.name, await b64(f));
    for (const k of names) SPR.src[k] = '游戏里'; sprDraw(); toast('装好了：游戏刷新一下就能看到');
  } catch (e) { toast('没装上：' + e.message); }
}
