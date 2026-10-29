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

// 游戏剧情（游戏剧情_设计.md）：剧本/_剧情/ 下每个 .json 是一个剧情段，_角色.json 是角色表。
// 返回 {chars, segs}；segs 每段带上 file（文件名）
const STORY = path.join(SCRIPTS, '_剧情');
function listStory() {
  if (!fs.existsSync(STORY)) return { chars: [], segs: [] };
  const read = f => JSON.parse(fs.readFileSync(path.join(STORY, f), 'utf8'));
  const chars = fs.existsSync(path.join(STORY, '_角色.json')) ? read('_角色.json').chars || [] : [];
  const segs = fs.readdirSync(STORY).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort((a, b) => a.localeCompare(b, 'zh'))
    .map(f => ({ ...read(f), file: f }));
  return { chars, segs };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css; charset=utf-8' };

module.exports = { ROOT, SCRIPTS, listAll, listStory, TYPES };
