// 大肥鱼 Demo 的桌面外壳（Electron）：一个窗口，里面就是 游戏/ 网页本身。
// 游戏用的文件走自定义协议 dfy://game/…（固定的来源，本机存档 localStorage 才不会丢），/api/list、/api/story 在这里现算（和 剧情编辑器/剧本库.js 一样）。
// 开发时 `npm start` 直接读项目里的文件；打包后读 build.js 复制进来的 app/。
const { app, BrowserWindow, protocol, net, Menu } = require('electron');
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');

const PACKED = path.join(__dirname, 'app');
const ROOT = fs.existsSync(PACKED) ? PACKED : path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, '剧本');
protocol.registerSchemesAsPrivileged([{ scheme: 'dfy', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// 所有用户及其场景：和 剧情编辑器/剧本库.js 的 listAll 一样
function listAll() {
  return fs.readdirSync(SCRIPTS, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(SCRIPTS, d.name, '用户.json')))
    .map(d => {
      const dir = path.join(SCRIPTS, d.name), user = JSON.parse(fs.readFileSync(path.join(dir, '用户.json'), 'utf8'));
      const scenes = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '用户.json')
        .map(f => { const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { file: f, order: s.order, title: s.title }; })
        .sort((a, b) => a.order - b.order);
      return { dir: d.name, user, scenes };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir, 'zh'));
}

// 游戏剧情：角色表 + 剧情段（剧本/_剧情/）：和 剧情编辑器/剧本库.js 的 listStory 一样
function listStory() {
  const dir = path.join(SCRIPTS, '_剧情'); if (!fs.existsSync(dir)) return { chars: [], segs: [] };
  const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const chars = fs.existsSync(path.join(dir, '_角色.json')) ? read('_角色.json').chars || [] : [];
  const segs = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort((a, b) => a.localeCompare(b, 'zh')).map(f => ({ ...read(f), file: f }));
  return { chars, segs };
}
const json = o => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json; charset=utf-8' } });

app.whenReady().then(() => {
  protocol.handle('dfy', req => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/api/list') return json(listAll());
    if (p === '/api/story') return json(listStory());
    if (p === '/') p = '/游戏/index.html'; else if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
    if (!fs.existsSync(f)) return new Response('not found', { status: 404 });   // 比如还没交的工位立绘
    return net.fetch(pathToFileURL(f).toString());
  });
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1280, height: 760, minWidth: 640, minHeight: 400, backgroundColor: '#000000', title: '大肥鱼的 28 日成神计划',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true, show: false,
  });
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', e => e.preventDefault());   // 窗口标题固定，不跟着网页的 <title> 变
  // F11 全屏；Ctrl+R / F5 不让刷新（刷新等于没确认就退出）
  win.webContents.on('before-input-event', (e, k) => {
    if (k.type !== 'keyDown') return;
    if (k.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (k.key === 'F5' || (k.control && k.key.toLowerCase() === 'r')) e.preventDefault();
  });
  win.loadURL('dfy://game/游戏/');
});
app.on('window-all-closed', () => app.quit());
