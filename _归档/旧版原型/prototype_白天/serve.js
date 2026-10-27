// 白天原型的极简静态服务器（已归档）：node _归档/旧版原型/prototype_白天/serve.js → http://localhost:5182
// 整个项目根目录都能访问（白天原型、夜间原型、剧本库、共用的规则.js、素材），另有 /api/list 列出剧本库。
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT, listAll, TYPES } = require('../../../剧情编辑器/剧本库');
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/list') {
    try { res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(listAll())); }
    catch (e) { res.writeHead(500); return res.end(e.message); }
  }
  const p = path.join(ROOT, url === '/' ? '_归档/旧版原型/prototype_白天/index.html' : url);
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(5182, () => console.log('day prototype on http://localhost:5182'));
