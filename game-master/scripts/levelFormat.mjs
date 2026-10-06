// ===== 文字关卡的格式：解析、编译成 world.json 的一层、拼整层字符画（纯函数，浏览器和 Node 都能用） =====
// 命令行工具是 scripts/level.mjs；开发时 bot（src/dev/bot.ts）直接在浏览器里用它编译 levels/*.txt 试玩。格式见 levels/README.md。

/** 主图里的字符：砖块 */
export const TILES = new Set(['.', 'R', 'r', 'B', 'S', 'X', 'Z', '=', '_', 'E']);
/** 主图里的字符：物件（底下是空气） */
export const ENTITIES = new Set(['P', 'M', 'G', 'T', 'C', 'h', 'b', 'D', 'q', 'Q', 'N', 'K', 'k', 'V']);
/** 主图里的字符：门（底下是空气）→ 组号；钥匙直接写组号 1-9 */
export const DOORS = { '!': 1, '@': 2, '$': 3, '^': 4 };
/** 移动方块只能画在这些砖上（实心、自己不会掉） */
export const MOVABLE = new Set(['R', 'r', '=', '_', 'E']);
export const SOLID = new Set(['R', 'r', 'B', 'S', 'Z', '=', 'E']);   // 挡人的（木板单向，不算）

export function parseLevel(text) {
  const lines = text.split(/\r?\n/);
  const lv = { id: '', name: '', place: undefined, music: undefined, background: undefined, w: 0, h: 0, groups: [], layout: [], rooms: {}, layers: { fuse: {}, movers: {}, fog: {} }, flags: {}, roomBackgrounds: {} };
  const errors = [];
  let i = 0;
  const grid = (n, what) => {
    const rows = [];
    while (rows.length < n && i < lines.length) { const l = lines[i++]; if (l.trim() === '' || l.startsWith('#')) { if (rows.length) break; continue; } rows.push(l.trimEnd()); }
    if (rows.length !== n) errors.push(`${what}: 要 ${n} 行，只有 ${rows.length} 行`);
    return rows;
  };
  while (i < lines.length) {
    const raw = lines[i++], line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [cmd, ...args] = line.split(/\s+/);
    if (cmd === 'floor') lv.id = args[0];
    else if (cmd === 'name') lv.name = args.join(' ');
    else if (cmd === 'place') lv.place = args.join(' ');
    else if (cmd === 'music') lv.music = args[0];
    else if (cmd === 'background') lv.background = args[0];
    else if (cmd === 'roombg') lv.roomBackgrounds[args[0]] = args[1];
    else if (cmd === 'size') { lv.w = Number(args[0]); lv.h = Number(args[1]); }
    else if (cmd === 'group') lv.groups.push({ id: Number(args[0]), color: parseInt(args[1].replace('#', ''), 16) });
    else if (cmd === 'flag') (lv.flags[args[0]] ??= {})[args[1]] = true;
    else if (cmd === 'layout') {
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#')) lv.layout.push(lines[i++].trim());
    } else if (cmd === 'room') {
      const key = args[0], layer = args[1];
      if (!lv.w || !lv.h) { errors.push('size 要写在 room 前面'); break; }
      const rows = grid(lv.h, `房间 ${key}${layer ? ' ' + layer : ''}`);
      rows.forEach((r, y) => { if (r.length !== lv.w) errors.push(`房间 ${key}${layer ? ' ' + layer : ''} 第 ${y + 1} 行：${r.length} 个字符，应该是 ${lv.w}`); });
      if (!layer) lv.rooms[key] = rows;
      else if (lv.layers[layer]) lv.layers[layer][key] = rows;
      else errors.push(`不认识的层：${layer}（只有 fuse / movers / fog）`);
    } else errors.push(`第 ${i} 行：不认识的指令 ${cmd}`);
  }
  return { lv, errors };
}

/** 编译成 Floor；返回 floor、错误、提醒 */
export function compileLevel(lv) {
  const errors = [], warnings = [];
  const { w, h } = lv;
  if (!lv.id) errors.push('缺 floor <id>');
  const keys = new Set(lv.layout.join('').replace(/\./g, ''));
  keys.forEach(k => { if (!lv.rooms[k]) errors.push(`布局里有房间 ${k}，但没画`); });
  Object.keys(lv.rooms).forEach(k => { if (!keys.has(k)) warnings.push(`房间 ${k} 画了但不在布局里`); });
  const groupIds = new Set(lv.groups.map(g => g.id));
  const dots = () => Array.from({ length: h }, () => '.'.repeat(w));
  const model = { roomW: w, roomH: h, layout: lv.layout.map(r => [...r].map(c => (c === '.' ? null : c))), rooms: {}, entities: {} };
  const locks = { groups: lv.groups, doors: {}, keys: {} };
  let spawns = 0;
  const count = {};
  for (const [key, rows] of Object.entries(lv.rooms)) {
    const tiles = [], ents = [], doors = [], keyRows = [];
    rows.forEach((row, y) => {
      let t = '', e = '', d = '', k = '';
      [...row].forEach((c, x) => {
        let tile = '.', ent = '.', door = '.', kk = '.';
        if (TILES.has(c)) tile = c;
        else if (ENTITIES.has(c)) { ent = c; if (c === 'P') spawns++; }
        else if (c in DOORS) { door = String(DOORS[c]); if (!groupIds.has(DOORS[c])) errors.push(`房间 ${key} (${x},${y})：门 ${c} 的组 ${DOORS[c]} 没有 group`); }
        else if (/[1-9]/.test(c)) { kk = c; if (!groupIds.has(Number(c))) errors.push(`房间 ${key} (${x},${y})：钥匙 ${c} 没有 group`); }
        else errors.push(`房间 ${key} (${x},${y})：不认识的字符 '${c}'`);
        count[c] = (count[c] ?? 0) + 1;
        t += tile; e += ent; d += door; k += kk;
      });
      tiles.push(t); ents.push(e); doors.push(d); keyRows.push(k);
    });
    model.rooms[key] = tiles; model.entities[key] = ents; locks.doors[key] = doors; locks.keys[key] = keyRows;
  }
  if (spawns !== 1) errors.push(`出生点 P 要正好 1 个，现在 ${spawns} 个`);
  if (lv.groups.length) model.locks = locks;
  for (const [name, layer] of Object.entries(lv.layers)) {
    if (!Object.keys(layer).length) continue;
    model[name] = Object.fromEntries(Object.keys(lv.rooms).map(k => [k, layer[k] ?? dots()]));
  }
  // 移动方块只能画在能搬的砖上
  for (const [key, rows] of Object.entries(lv.layers.movers)) rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === '.') return;
    if (c !== 'h' && c !== 'v') errors.push(`房间 ${key} movers (${x},${y})：只有 h / v`);
    const t = model.rooms[key]?.[y]?.[x];
    if (!MOVABLE.has(t)) errors.push(`房间 ${key} movers (${x},${y})：底下是 '${t}'，移动方块只能画在 R r = _ E 上`);
  }));
  if (Object.keys(lv.flags).length) model.roomFlags = lv.flags;
  for (const key of Object.keys(lv.roomBackgrounds)) if (!lv.rooms[key]) errors.push(`roombg ${key}：没有这个房间`);
  if (Object.keys(lv.roomBackgrounds).length) model.roomBackgrounds = lv.roomBackgrounds;
  checkEdges(lv, model, warnings);
  const floor = { id: lv.id, name: lv.name || lv.id, ...(lv.place ? { place: lv.place } : {}), ...(lv.music ? { music: lv.music } : {}), ...(lv.background ? { background: lv.background } : {}), model };
  return { floor, errors, warnings, count };
}

/** 房间交界：一边是空气、另一边是实心 → 提醒（走过去会撞墙）；整层外沿是空气 → 提醒（会走出地图） */
function checkEdges(lv, model, warnings) {
  const { w, h } = lv, L = model.layout;
  const at = (rx, ry) => (ry >= 0 && ry < L.length && rx >= 0 && rx < (L[ry]?.length ?? 0) ? L[ry][rx] : null);
  // 门在砖块层里是空气，但游戏里开之前是实心的：外沿上的门不算漏洞；交界一边是门就不提醒（门开了才通，是故意的）
  const isDoor = (key, x, y) => (model.locks?.doors[key]?.[y]?.[x] ?? '.') !== '.';
  const open = (key, x, y) => { const c = model.rooms[key]?.[y]?.[x]; return c !== undefined && !SOLID.has(c) && !isDoor(key, x, y); };
  L.forEach((row, ry) => row.forEach((key, rx) => {
    if (!key) return;
    const right = at(rx + 1, ry), down = at(rx, ry + 1);
    for (let y = 0; y < h; y++) {
      const a = open(key, w - 1, y);
      if (right) { const b = open(right, 0, y); if (a !== b && !isDoor(key, w - 1, y) && !isDoor(right, 0, y)) warnings.push(`${key}|${right} 交界第 ${y} 行：${a ? '左边空、右边堵' : '左边堵、右边空'}`); }
      else if (a) warnings.push(`${key} 右边沿第 ${y} 行是空的，外面没房间`);
      if (!at(rx - 1, ry) && open(key, 0, y)) warnings.push(`${key} 左边沿第 ${y} 行是空的，外面没房间`);
    }
    for (let x = 0; x < w; x++) {
      const a = open(key, x, h - 1);
      if (down) { const b = open(down, x, 0); if (a !== b && !isDoor(key, x, h - 1) && !isDoor(down, x, 0)) warnings.push(`${key}/${down} 交界第 ${x} 列：${a ? '上边空、下边堵' : '上边堵、下边空'}`); }
      else if (a) warnings.push(`${key} 下边沿第 ${x} 列是空的，外面没房间`);
      if (!at(rx, ry - 1) && open(key, x, 0)) warnings.push(`${key} 上边沿第 ${x} 列是空的，外面没房间`);
    }
  }));
}

/** 整层拼成一张大字符画（房间之间不留缝），方便看交界对不对 */
export function stitch(lv) {
  const out = [];
  lv.layout.forEach(row => {
    for (let y = 0; y < lv.h; y++) out.push([...row].map(k => (k === '.' ? ' '.repeat(lv.w) : lv.rooms[k]?.[y] ?? '?'.repeat(lv.w))).join(''));
  });
  return out.join('\n');
}
