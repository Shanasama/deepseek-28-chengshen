import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 本地磁盘双向同步插件 (big-fat-fish-fs-api)
 * - 允许内部剧情树编辑器直接将修改写回 `data/scenarios/*.json`、`data/config.json`、`data/training.json`
 * - 监听 `data/` 目录下任何 JSON 的外部修改（如在 Cursor 另一窗口改文案），向前端推送热更新事件
 */
function bigFatFishFsPlugin(): Plugin {
  const dataDir = path.resolve(__dirname, 'data');
  const scenariosDir = path.join(dataDir, 'scenarios');

  const readJsonSafe = (filePath: string) => {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  };

  return {
    name: 'big-fat-fish-fs-api',
    configureServer(server) {
      // 监听 data 目录下的文件变动，通知前端 0 秒热同步
      server.watcher.add(dataDir);
      server.watcher.on('change', (changedPath) => {
        if (changedPath.startsWith(dataDir) && changedPath.endsWith('.json')) {
          server.ws.send({
            type: 'custom',
            event: 'fish-data-updated',
            data: { file: path.relative(dataDir, changedPath) },
          });
        }
      });

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        try {
          if (req.method === 'GET' && req.url.startsWith('/api/data')) {
            const config = readJsonSafe(path.join(dataDir, 'config.json'));
            const training = readJsonSafe(path.join(dataDir, 'training.json'));
            const files = fs
              .readdirSync(scenariosDir)
              .filter((f) => f.endsWith('.json'))
              .sort();
            const characters = files.map((file) => {
              const content = readJsonSafe(path.join(scenariosDir, file));
              return { _fileName: file, ...content };
            });

            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, config, training, characters }));
            return;
          }

          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.from(chunk));
            }
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const body = bodyStr ? JSON.parse(bodyStr) : {};

            if (req.url === '/api/save-scenario') {
              const character = body.character;
              if (!character || !character.characterId) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Missing characterId' }));
                return;
              }
              const safeId = String(character.characterId).replace(/[^a-zA-Z0-9_-]/g, '_');
              const fileName = character._fileName || `${safeId}.json`;
              const toWrite = { ...character };
              delete toWrite._fileName;
              if (!toWrite.$schema) {
                toWrite.$schema = '../schema/scenario.schema.json';
              }
              const targetPath = path.join(scenariosDir, fileName);
              fs.writeFileSync(targetPath, JSON.stringify(toWrite, null, 2) + '\n', 'utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, fileName }));
              return;
            }

            if (req.url === '/api/delete-scenario') {
              const { fileName } = body;
              if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Invalid fileName' }));
                return;
              }
              const targetPath = path.join(scenariosDir, fileName);
              if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (req.url === '/api/save-config') {
              const targetPath = path.join(dataDir, 'config.json');
              fs.writeFileSync(targetPath, JSON.stringify(body.config, null, 2) + '\n', 'utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (req.url === '/api/save-training') {
              const targetPath = path.join(dataDir, 'training.json');
              fs.writeFileSync(targetPath, JSON.stringify(body.training, null, 2) + '\n', 'utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
              return;
            }
          }

          res.statusCode = 404;
          res.end(JSON.stringify({ ok: false, error: 'Not found' }));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), bigFatFishFsPlugin()],
  server: {
    port: 5173,
    open: false,
  },
});
