// 原型用的极简静态服务器：node serve.js → http://localhost:5180
// 原型文件从本目录出；/剧本/ 下的剧本和 /api/list 从项目的剧本库出（和剧情编辑器共用）。
const http = require('http'), fs = require('fs'), path = require('path');
const { ROOT, listAll, TYPES } = require('../剧情编辑器/剧本库');
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/list') {
    try { res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(listAll())); }
    catch (e) { res.writeHead(500); return res.end(e.message); }
  }
  const base = url.startsWith('/剧本/') ? ROOT : __dirname;
  const p = path.join(base, url === '/' ? 'index.html' : url);
  if (!p.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(5180, () => console.log('prototype on http://localhost:5180'));
