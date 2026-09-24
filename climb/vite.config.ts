/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

const MAP_FILE = fileURLToPath(new URL('./src/map/world.json', import.meta.url));

/**
 * 开发期专用：编辑器 POST /__climb/save-map，直接把地图写进 src/map/world.json。
 * 只在 `npm run dev` 的开发服务器上存在，打包产物里没有。
 */
function saveMapPlugin(): Plugin {
  return {
    name: 'climb-save-map',
    apply: 'serve',
    // 写回 world.json 时不要触发页面刷新：运行时的地图在 Redux 里，文件只是默认值
    handleHotUpdate(ctx) { if (ctx.file === MAP_FILE) return []; },
    configureServer(server) {
      server.middlewares.use('/__climb/load-map', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        try { res.end(await readFile(MAP_FILE, 'utf8')); } catch (err) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: (err as Error).message })); }
      });
      server.middlewares.use('/__climb/save-map', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        let body = '';
        req.on('data', (c: Buffer) => { body += c; });
        req.on('end', async () => {
          try {
            const m = JSON.parse(body) as { floors?: unknown; roomW?: unknown; roomH?: unknown; layout?: unknown; rooms?: unknown };
            const isModel = (o: { roomW?: unknown; roomH?: unknown; layout?: unknown; rooms?: unknown }) => typeof o.roomW === 'number' && typeof o.roomH === 'number' && Array.isArray(o.layout) && !!o.rooms;
            const ok = Array.isArray(m.floors)
              ? m.floors.length > 0 && m.floors.every((f: { id?: unknown; model?: unknown }) => typeof f?.id === 'string' && isModel((f.model ?? {}) as { roomW?: unknown }))
              : isModel(m);
            if (!ok) throw new Error('不是合法的地图项目');
            await writeFile(MAP_FILE, JSON.stringify(m, null, 2) + '\n', 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, file: 'src/map/world.json' }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages 是项目子路径：https://<user>.github.io/gaming-design/
  base: process.env.GITHUB_PAGES ? '/gaming-design/' : '/',
  plugins: [react(), saveMapPlugin()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5174, strictPort: true },
  test: {
    environment: 'node',
    // 机制文件夹里的运行时类 import 了 Phaser；测试只用注册表，换成替身（见 src/test/phaser-stub.ts）
    alias: { phaser: fileURLToPath(new URL('./src/test/phaser-stub.ts', import.meta.url)) },
  },
});
