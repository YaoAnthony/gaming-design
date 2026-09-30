#!/usr/bin/env node
// ===== 文字关卡：一个 .txt 写一整层，编译成 world.json 里的一层 =====
// 砖块、物件、钥匙、门画在同一张字符画里；引线、移动方块、迷雾区各自另画一张（只有用到的房间才要）。格式见 levels/README.md。
//   node scripts/level.mjs levels/floor2.txt           检查，打印整层拼起来的样子和概况
//   node scripts/level.mjs levels/floor2.txt --write   写进 src/map/world.json：同 id 的层整层替换，没有就加在最后，别的层不动
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileLevel, DOORS, ENTITIES, parseLevel, stitch } from './levelFormat.mjs';

const MAP_FILE = fileURLToPath(new URL('../src/map/world.json', import.meta.url));

function main() {
  const [file, flag] = process.argv.slice(2);
  if (!file) { console.error('用法：node scripts/level.mjs <关卡.txt> [--write]'); process.exit(2); }
  const { lv, errors: parseErrors } = parseLevel(readFileSync(file, 'utf8'));
  const { floor, errors, warnings, count } = compileLevel(lv);
  const all = [...parseErrors, ...errors];
  console.log(stitch(lv));
  console.log(`\n层 ${floor.id}「${floor.name}」 ${lv.w}x${lv.h}，房间 ${Object.keys(lv.rooms).join(' ')}`);
  console.log('物件：' + Object.entries(count).filter(([c]) => ENTITIES.has(c) || c in DOORS || /[1-9]/.test(c)).map(([c, n]) => `${c}×${n}`).join(' '));
  warnings.forEach(w => console.log('提醒：' + w));
  all.forEach(e => console.log('错误：' + e));
  if (all.length) process.exit(1);
  if (flag === '--write') {
    const world = JSON.parse(readFileSync(MAP_FILE, 'utf8'));
    const idx = world.floors.findIndex(f => f.id === floor.id);
    if (idx >= 0) world.floors[idx] = floor; else world.floors.push(floor);
    writeFileSync(MAP_FILE, JSON.stringify(world, null, 2) + '\n', 'utf8');
    console.log(`已写进 src/map/world.json（${idx >= 0 ? '替换' : '新加'}第 ${(idx >= 0 ? idx : world.floors.length - 1) + 1} 层）`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
