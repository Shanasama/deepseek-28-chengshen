// 剧本库的只读部分：编辑器服务器和夜间原型的服务器共用。
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, '剧本');

// 所有用户及其场景：[{dir, user, scenes:[{file, order, title}]}]
function listAll() {
  return fs.readdirSync(SCRIPTS, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(SCRIPTS, d.name, '用户.json')))
    .map(d => {
      const dir = path.join(SCRIPTS, d.name);
      const user = JSON.parse(fs.readFileSync(path.join(dir, '用户.json'), 'utf8'));
      const scenes = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json') && f !== '用户.json')
        .map(f => { const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { file: f, order: s.order, title: s.title }; })
        .sort((a, b) => a.order - b.order);
      return { dir: d.name, user, scenes };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir, 'zh'));
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css; charset=utf-8' };

module.exports = { ROOT, SCRIPTS, listAll, TYPES };
