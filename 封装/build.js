// 把 Demo 打包成 Windows 桌面程序：双击项目根目录的「一键封装.cmd」（第一次会先 npm install），或 node 封装/build.js
// 1. 把游戏要用的文件复制进 .stage/app/（游戏/、剧本/、素材/、剧情编辑器/规则.js；编辑器本身不打包）
// 2. 画图标（像素鲸鱼）
// 3. 拼出 Windows 程序文件夹（Electron 运行时 + app.asar + 图标），放到 OUT（默认桌面的 28日/大肥鱼的28日成神计划/）
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..'), STAGE = path.join(__dirname, '.stage');
const OUT = process.env.DFY_OUT || path.join(require('os').homedir(), 'Desktop', '28日');
const NAME = '大肥鱼的28日成神计划';

// ---- 1. 复制文件 ----
fs.rmSync(STAGE, { recursive: true, force: true });
// 自己递归复制：Windows 上 Node 22 的 fs.cpSync 碰到中文路径会直接段错误
// 不进安装包的：工位立绘的样稿和「装进游戏」时留下的旧文件
const SKIP = new Set([path.join(ROOT, '游戏', '素材', '大肥鱼', '样稿'), path.join(ROOT, '游戏', '素材', '大肥鱼', '_旧')]);
function cp(src, dst) {
  if (SKIP.has(src)) return;
  if (fs.statSync(src).isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const n of fs.readdirSync(src)) cp(path.join(src, n), path.join(dst, n)); }
  else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
}
const copy = (rel, to = rel) => cp(path.join(ROOT, rel), path.join(STAGE, 'app', to));
copy('游戏'); copy('剧本'); copy('素材'); copy('剧情编辑器/规则.js');
fs.copyFileSync(path.join(__dirname, 'main.js'), path.join(STAGE, 'main.js'));
const pkg = require('./package.json');
fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({ name: pkg.name, productName: NAME, version: pkg.version, main: 'main.js' }, null, 2));

// ---- 2. 图标：深蓝圆角方块上一只像素鲸鱼（和游戏里的 ICON.whale 同一张图）----
const base = fs.readFileSync(path.join(ROOT, '游戏/js/基础.js'), 'utf8');
const whale = JSON.parse(base.match(/whale: (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const PAL = { k: [14, 16, 24], B: [63, 110, 232], w: [248, 250, 255], I: [201, 236, 255] };
function icon(N) {
  const px = Buffer.alloc(N * N * 4), set = (x, y, c, a = 255) => { const o = (y * N + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = a; };
  const r = Math.round(N * .16), cut = (x, y) => { const dx = Math.max(r - x, x - (N - 1 - r), 0), dy = Math.max(r - y, y - (N - 1 - r), 0); return dx * dx + dy * dy > r * r; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!cut(x, y)) set(x, y, y < N * .55 ? [27, 37, 96] : [18, 26, 66]);
  const W = Math.max(...whale.map(s => s.length)), H = whale.length, s = Math.floor(N * .8 / W), ox = (N - W * s) >> 1, oy = (N - H * s) >> 1;
  whale.forEach((row, j) => [...row].forEach((ch, i) => { const c = PAL[ch]; if (!c) return; for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) set(ox + i * s + x, oy + j * s + y, c); }));
  return png(N, N, px);
}
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// ICO 里直接塞 PNG（Windows Vista 起都认）
function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = 6 + 16 * pngs.length; const dir = [], body = [];
  for (const [n, data] of pngs) { const e = Buffer.alloc(16); e[0] = n >= 256 ? 0 : n; e[1] = n >= 256 ? 0 : n; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(data.length, 8); e.writeUInt32LE(off, 12); off += data.length; dir.push(e); body.push(data); }
  return Buffer.concat([head, ...dir, ...body]);
}
const big = icon(256);
fs.writeFileSync(path.join(STAGE, 'icon.png'), big);
fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico([[256, big], [64, icon(64)], [32, icon(32)], [16, icon(16)]]));
fs.copyFileSync(path.join(STAGE, 'icon.png'), path.join(__dirname, 'icon.png'));

// ---- 3. 拼出程序文件夹 ----
// 不用 @electron/packager 的整套流程：它在临时目录里改名文件夹那一步，在这台机器上总是 EPERM（新解压的 exe 被占着）。
// 自己拼：复制 Electron 运行时 → electron.exe 改名 → 游戏打成 resources/app.asar → 换图标和版本信息
(async () => {
  const asar = await import('@electron/asar'), ResEdit = await import('resedit');
  const dist = path.join(__dirname, 'node_modules', 'electron', 'dist'), final = path.join(OUT, NAME), exe = path.join(final, NAME + '.exe');
  if (!fs.existsSync(path.join(dist, 'electron.exe'))) throw new Error('没有 Electron 运行时：先在 封装/ 里 npm install，再 node node_modules/electron/install.js');
  fs.rmSync(final, { recursive: true, force: true });
  cp(dist, final);
  fs.renameSync(path.join(final, 'electron.exe'), exe);
  fs.rmSync(path.join(final, 'resources', 'default_app.asar'), { force: true });
  await asar.createPackage(STAGE, path.join(final, 'resources', 'app.asar'));
  // 图标 + 版本信息（任务栏、资源管理器里显示的名字）
  const bin = ResEdit.NtExecutable.from(fs.readFileSync(exe)), res = ResEdit.NtExecutableResource.from(bin);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const group = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)[0];
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group ? group.id : 1, group ? group.lang : 1033, iconFile.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
    vi.setStringValues(lang, { ProductName: NAME, FileDescription: NAME, CompanyName: 'yuan', OriginalFilename: NAME + '.exe', InternalName: NAME, LegalCopyright: 'yuan' });
    vi.setFileVersion(...require('./package.json').version.split('.').map(Number), 0); vi.setProductVersion(...require('./package.json').version.split('.').map(Number), 0);
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(bin); fs.writeFileSync(exe, Buffer.from(bin.generate()));
  console.log('打包完成：' + exe);
  if (process.argv.includes('--open')) require('child_process').exec(`explorer "${final}"`);   // 「一键封装.cmd」带这个：打完把文件夹打开
})().catch(e => { console.error(e); process.exit(1); });
