/// <reference types="vitest/config" />
import { defineConfig, normalizePath, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const MAP_FILE = fileURLToPath(new URL('./src/map/world.json', import.meta.url));
/** Vite 给钩子的路径是正斜杠；Windows 上 MAP_FILE 是反斜杠，直接比较永远不相等 */
const MAP_FILE_POSIX = normalizePath(MAP_FILE);

/**
 * 开发期专用：编辑器 POST /__climb/save-map，直接把地图写进 src/map/world.json。
 * 只在 `npm run dev` 的开发服务器上存在，打包产物里没有。
 */
function saveMapPlugin(): Plugin {
  return {
    name: 'climb-save-map',
    apply: 'serve',
    // 写回 world.json 时不要触发页面刷新：运行时的地图在 Redux 里，文件只是默认值
    handleHotUpdate(ctx) { if (normalizePath(ctx.file) === MAP_FILE_POSIX) return []; },
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

const RECORDINGS_DIR = fileURLToPath(new URL('./recordings/', import.meta.url));

/**
 * 开发期专用：谱面录制（技术验证编辑器）POST /__climb/save-recording，把录下来的按键写进 recordings/<谱面 id>.json
 * （同一张谱再录一次就覆盖；另外留一份带时间的备份）。只在 `npm run dev` 的开发服务器上存在。
 */
function saveRecordingPlugin(): Plugin {
  return {
    name: 'climb-save-recording',
    apply: 'serve',
    // 录制文件不是代码：写了不刷新页面
    handleHotUpdate(ctx) { if (normalizePath(ctx.file).startsWith(normalizePath(RECORDINGS_DIR))) return []; },
    configureServer(server) {
      server.middlewares.use('/__climb/save-recording', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        let body = '';
        req.on('data', (c: Buffer) => { body += c; });
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const r = JSON.parse(body) as { chartId?: unknown; presses?: unknown };
            const okPress = (p: { ms?: unknown; code?: unknown }) => typeof p?.ms === 'number' && typeof p?.code === 'string';
            if (typeof r.chartId !== 'string' || !/^[\w-]+$/.test(r.chartId) || !Array.isArray(r.presses) || !r.presses.every(okPress)) throw new Error('不是合法的录制');
            const text = JSON.stringify(r, null, 2) + '\n', stamp = new Date().toISOString().replace(/[:.]/g, '-');
            await mkdir(RECORDINGS_DIR, { recursive: true });
            await writeFile(RECORDINGS_DIR + `${r.chartId}.json`, text, 'utf8');
            await writeFile(RECORDINGS_DIR + `${r.chartId}-${stamp}.json`, text, 'utf8');
            res.end(JSON.stringify({ ok: true, file: `recordings/${r.chartId}.json` }));
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
  plugins: [react(), saveMapPlugin(), saveRecordingPlugin()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5174, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // 引擎和 React 单独成包：改游戏代码后，浏览器缓存里的这两个大包还能用
        manualChunks: { phaser: ['phaser'], three: ['three'], react: ['react', 'react-dom', 'react-redux', '@reduxjs/toolkit'] },
      },
    },
    // Phaser 压缩后本身就一百多万字节，拆不开；其它包超过这个大小才提醒
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    // 测试都在 tests/ 里（目录结构和 src/ 一一对应），不和源码混在一起
    include: ['tests/**/*.test.{ts,mjs}'],
    // 机制文件夹里的运行时类 import 了 Phaser；测试只用注册表，换成替身（见 tests/support/phaser-stub.ts）
    alias: { phaser: fileURLToPath(new URL('./tests/support/phaser-stub.ts', import.meta.url)) },
  },
});
