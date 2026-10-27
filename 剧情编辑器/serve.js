// 剧情编辑器的本地服务器：node 剧情编辑器/serve.js → http://localhost:5181
// 静态文件从项目根目录出（编辑器页面 + 剧本/ 下的 JSON 和图片），另有 /api/* 读写剧本。
// 只有这一层碰文件系统；以后封装成桌面程序时，只需替换它。
//
//   GET  /api/list                    所有用户及其场景
//   PUT  /api/file?p=<剧本内路径>      覆盖写一个 JSON（内容必须是合法 JSON）
//   POST /api/file?p=<剧本内路径>      新建一个 JSON，已存在则 409
//   POST /api/upload?p=<剧本内路径>    上传图片（body 为 base64），已存在则自动改名
//   GET  /api/events                  剧本/ 下文件变动的推送（SSE）
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT, SCRIPTS, listAll, TYPES: types } = require('./剧本库');
const PORT = 5181;
const IMG = new Set(['.png', '.jpg', '.svg']);

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
}).listen(PORT, () => console.log(`剧情编辑器 on http://localhost:${PORT}`));
