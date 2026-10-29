// 剧情编辑器的本地服务器：node 剧情编辑器/serve.js → http://localhost:5181
// 静态文件从项目根目录出（编辑器页面 + 剧本/ 下的 JSON 和图片），另有 /api/* 读写剧本。
// 只有这一层碰文件系统；以后封装成桌面程序时，只需替换它。
//
//   GET  /api/list                    所有用户及其场景
//   GET  /api/story                   游戏剧情：角色表 + 所有剧情段（剧本/_剧情/）
//   PUT  /api/file?p=<剧本内路径>      覆盖写一个 JSON（内容必须是合法 JSON）
//   POST /api/file?p=<剧本内路径>      新建一个 JSON，已存在则 409
//   POST /api/upload?p=<剧本内路径>    上传图片（body 为 base64），已存在则自动改名
//   DELETE /api/file?p=_剧情/<文件>    删掉一个剧情段（只许删 剧本/_剧情/ 下的 .json，角色表不能删）
//   PUT  /api/sprite?f=<文件名>        工位立绘「装进游戏」：写进 游戏/素材/大肥鱼/（png / aseprite 的 body 为 base64），原来的挪进 _旧/
//   GET  /api/events                  剧本/ 下文件变动的推送（SSE）
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT, SCRIPTS, listAll, listStory, TYPES: types } = require('./剧本库');
const PORT = 5181;
const IMG = new Set(['.png', '.jpg', '.svg']);
const SPRITE_DIR = path.join(ROOT, '游戏', '素材', '大肥鱼');
const SPRITE_EXT = { '.png': 'b64', '.aseprite': 'b64', '.json': 'text', '.txt': 'text' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, bad) => { const bufs = []; req.on('data', b => bufs.push(b)); req.on('end', () => ok(Buffer.concat(bufs).toString('utf8'))); req.on('error', bad); });
}
// 剧本内的相对路径 → 绝对路径；越界或文件名非法就抛错
function inScripts(rel) {
  if (!rel || /[<>:"|?*]/.test(rel)) throw Object.assign(new Error('非法路径：' + rel), { code: 400 });
  const p = path.resolve(SCRIPTS, rel);
  if (!p.startsWith(SCRIPTS + path.sep)) throw Object.assign(new Error('只能写剧本目录：' + rel), { code: 403 });
  return p;
}

// ---- 文件变动推送 ----
const clients = new Set(), pending = new Map();
try {
  fs.watch(SCRIPTS, { recursive: true }, (_, file) => {
    if (!file) return;
    const rel = file.split(path.sep).join('/');
    clearTimeout(pending.get(rel));
    pending.set(rel, setTimeout(() => { pending.delete(rel); for (const c of clients) c.write(`data: ${JSON.stringify({ path: rel })}\n\n`); }, 120));
  });
} catch (e) { console.warn('文件监听不可用：', e.message); }

async function api(req, res, url, q) {
  if (url === '/api/list') return send(res, 200, listAll());
  if (url === '/api/story') return send(res, 200, listStory());
  if (url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': hi\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (url === '/api/file' && (req.method === 'PUT' || req.method === 'POST')) {
    const p = inScripts(q.get('p'));
    if (!p.endsWith('.json')) return send(res, 400, { error: '只能写 .json' });
    const text = await readBody(req);
    try { JSON.parse(text); } catch (e) { return send(res, 400, { error: 'JSON 格式错误：' + e.message }); }
    if (req.method === 'POST' && fs.existsSync(p)) return send(res, 409, { error: '已存在：' + q.get('p') });
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p + '.tmp', text, 'utf8'); fs.renameSync(p + '.tmp', p);   // 先写临时文件再改名，写到一半断电也不会坏
    return send(res, 200, { ok: true, path: q.get('p') });
  }
  if (url === '/api/file' && req.method === 'DELETE') {
    const rel = q.get('p') || '', p = inScripts(rel);
    if (!/^_剧情\/[^/]+\.json$/.test(rel) || rel === '_剧情/_角色.json') return send(res, 403, { error: '只能删剧情段：' + rel });
    if (!fs.existsSync(p)) return send(res, 404, { error: '没有这个文件：' + rel });
    fs.unlinkSync(p); return send(res, 200, { ok: true, path: rel });
  }
  if (url === '/api/upload' && req.method === 'POST') {
    let p = inScripts(q.get('p'));
    const ext = path.extname(p).toLowerCase();
    if (!IMG.has(ext)) return send(res, 400, { error: '只能上传 png / jpg / svg' });
    const base = p.slice(0, -ext.length);
    for (let i = 2; fs.existsSync(p); i++) p = `${base}-${i}${ext}`;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(await readBody(req), 'base64'));
    return send(res, 200, { ok: true, path: path.relative(SCRIPTS, p).split(path.sep).join('/') });
  }
  if (url === '/api/sprite' && req.method === 'PUT') {
    const name = q.get('f') || '', kind = SPRITE_EXT[path.extname(name).toLowerCase()];
    if (!kind || /[\\/:*?"<>|]/.test(name) || name.startsWith('.')) return send(res, 400, { error: '只能写 png / json / txt / aseprite：' + name });
    const p = path.join(SPRITE_DIR, name), body = await readBody(req);
    if (kind === 'text' && name.endsWith('.json')) { try { JSON.parse(body); } catch (e) { return send(res, 400, { error: 'JSON 格式错误：' + e.message }); } }
    fs.mkdirSync(SPRITE_DIR, { recursive: true });
    let backup = null;
    if (fs.existsSync(p)) {   // 原来的不删，挪进 _旧/（带时间），装错了能找回来
      const t = new Date(), stamp = [t.getFullYear(), t.getMonth() + 1, t.getDate(), '-', t.getHours(), t.getMinutes(), t.getSeconds()].map(v => typeof v === 'number' ? String(v).padStart(2, '0') : v).join('');
      const old = path.join(SPRITE_DIR, '_旧'); fs.mkdirSync(old, { recursive: true }); backup = '_旧/' + stamp + '_' + name; fs.renameSync(p, path.join(SPRITE_DIR, backup));
    }
    fs.writeFileSync(p + '.tmp', kind === 'b64' ? Buffer.from(body, 'base64') : body); fs.renameSync(p + '.tmp', p);
    return send(res, 200, { ok: true, path: '游戏/素材/大肥鱼/' + name, backup });
  }
  send(res, 404, { error: '没有这个接口' });
}

http.createServer(async (req, res) => {
  const [rawUrl, qs = ''] = req.url.split('?');
  const url = decodeURIComponent(rawUrl), q = new URLSearchParams(qs);
  try {
    if (url.startsWith('/api/')) return await api(req, res, url, q);
    // 以 / 结尾的路径给它的 index.html（游戏本体：/游戏/）
    const p = path.join(ROOT, url === '/' ? '剧情编辑器/index.html' : url.endsWith('/') ? url + 'index.html' : url);
    if (!p.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
    fs.readFile(p, (err, data) => {
      if (err) return send(res, 404, 'not found', 'text/plain');
      send(res, 200, data, types[path.extname(p).toLowerCase()] || 'application/octet-stream');
    });
  } catch (e) { send(res, typeof e.code === 'number' ? e.code : 500, { error: e.message }); }
}).on('error', e => {
  // 已经开着一个（比如又双击了一次「编辑剧情」，或开着编辑器又点「开始游戏」）：不报错，直接打开浏览器
  if (e.code !== 'EADDRINUSE') throw e;
  console.log(`剧情编辑器已经在运行：http://localhost:${PORT}`); openBrowser(); setTimeout(() => process.exit(0), 300);
}).listen(PORT, () => { console.log(`剧情编辑器 on http://localhost:${PORT}`); openBrowser(); });
// 带 --open 启动时顺便打开浏览器：「编辑剧情.cmd」是 --open（编辑器），「开始游戏.cmd」是 --open=/游戏/（游戏本体）
function openBrowser() {
  const arg = process.argv.find(a => a === '--open' || a.startsWith('--open=')); if (!arg) return;
  const url = `http://localhost:${PORT}${arg.split('=')[1] || '/'}`, cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  require('child_process').exec(cmd);
}
