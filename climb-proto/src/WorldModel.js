// ===== 世界模型：房间字符画 + 布局 =====
// 游戏和编辑器共用。model = { roomW, roomH, layout: [[key,...],...], rooms: {key: [rows]}, names: {key: 文案} }
const WorldModel = {
  default() {
    return {
      roomW: ROOM_W, roomH: ROOM_H,
      layout: LAYOUT.map(r => r.slice()),
      rooms: Object.fromEntries(Object.entries(ROOMS).map(([k, rows]) => [k, rows.slice()])),
      names: Object.assign({}, ROOM_NAMES),
    };
  },

  clone(model) { return JSON.parse(JSON.stringify(model)); },

  // 拼成整张地图（字符串数组）
  rows(model) {
    const out = [];
    model.layout.forEach(layoutRow => {
      for (let y = 0; y < model.roomH; y++) out.push(layoutRow.map(k => model.rooms[k][y]).join(''));
    });
    return out;
  },

  cols(model) { return model.layout[0].length; },
  keyAt(model, rx, ry) { return (model.layout[ry] || [])[rx] || null; },
  nameOf(model, key) { return model.names[key] || ''; },

  emptyRoom(w, h) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let s = '';
      for (let x = 0; x < w; x++) s += (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? 'R' : '.';
      rows.push(s);
    }
    return rows;
  },

  nextKey(model) {
    for (let i = 0; i < 26; i++) { const k = String.fromCharCode(65 + i); if (!model.rooms[k]) return k; }
    let n = 1; while (model.rooms['R' + n]) n++; return 'R' + n;
  },

  addRow(model) {
    const row = model.layout[0].map(() => { const k = this.nextKey(model); model.rooms[k] = this.emptyRoom(model.roomW, model.roomH); model.names[k] = ''; return k; });
    model.layout.push(row);
  },

  addCol(model) {
    model.layout.forEach(r => { const k = this.nextKey(model); model.rooms[k] = this.emptyRoom(model.roomW, model.roomH); model.names[k] = ''; r.push(k); });
  },

  setCell(model, key, x, y, ch) {
    const r = model.rooms[key][y];
    model.rooms[key][y] = r.substring(0, x) + ch + r.substring(x + 1);
  },

  // 把唯一物件（如出生点）在全图其他位置清掉
  clearUnique(model, ch) {
    Object.keys(model.rooms).forEach(k => {
      model.rooms[k] = model.rooms[k].map(r => r.split(ch).join('.'));
    });
  },

  // 找出生点：优先指定房间，其次全图
  findStart(model, prefRoom) {
    const rows = this.rows(model); const W = model.roomW, H = model.roomH;
    let any = null;
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== 'P') return;
      const rx = Math.floor(x / W), ry = Math.floor(y / H);
      if (prefRoom && rx === prefRoom.rx && ry === prefRoom.ry && !any?.pref) any = { x, y, pref: true };
      else if (!any) any = { x, y, pref: false };
    }));
    return any;
  },

  toWorldJs(model) {
    let s = "// 由地图编辑器导出\n// '.' 空气  '#' 泥土  'R' 岩石  'B' 脆岩  'S' 沙土  'X' 尖刺   'P' 出生点  'M' 怪物  'G' 终点\n\n";
    s += `const ROOM_W = ${model.roomW}, ROOM_H = ${model.roomH};\n\nconst ROOMS = {\n`;
    Object.keys(model.rooms).forEach(k => {
      s += `  // ${k} ${model.names[k] || ''}\n  ${/^[A-Za-z_]\w*$/.test(k) ? k : JSON.stringify(k)}: [\n`;
      model.rooms[k].forEach(r => { s += `    '${r}',\n`; });
      s += '  ],\n';
    });
    s += '};\n\n';
    s += `const LAYOUT = ${JSON.stringify(model.layout)};\n\n`;
    s += `const ROOM_NAMES = ${JSON.stringify(model.names)};\n`;
    return s;
  },
};
