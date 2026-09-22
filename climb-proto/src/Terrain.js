// 格子地形：爆炸破坏、支撑检测、失去支撑的地块整体下落
// 所有“这个格子能不能炸 / 会不会掉 / 挡不挡人”都问注册表（Tiles），这里不认识具体砖块字符。
class Terrain {
  constructor(scene, rows) {
    this.scene = scene;
    this.T = CFG.TILE;
    this.w = rows[0].length;
    this.h = rows.length;
    this.grid = rows.map(r => r.split('').map(c => Tiles.has(c) ? c : '.'));
    this.original = this.grid.map(r => r.slice());   // 用于房间重置
    this.chunks = [];                                  // 正在下落的碎块
    this.boundaryId = (Tiles.filter(d => d.anchor)[0] || { id: '.' }).id;   // 地图外视为锚点

    const data = this.grid.map(r => r.map(c => Terrain.frameOf(c)));
    this.map = scene.make.tilemap({ data, tileWidth: this.T, tileHeight: this.T });
    const tiles = this.map.addTilesetImage('tiles', 'tiles', this.T, this.T, 0, 0);
    this.layer = this.map.createLayer(0, tiles, 0, 0);
    this.layer.setCollision(Tiles.filter(d => d.solid && d.frame >= 0).map(d => d.frame));
  }

  static frameOf(id) { const d = Tiles.get(id); return (d && d.frame != null) ? d.frame : -1; }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this.boundaryId;
    return this.grid[y][x];
  }
  def(x, y) { return Tiles.get(this.get(x, y)); }
  isSolid(x, y) { return this.def(x, y).solid; }

  set(x, y, id) {
    this.grid[y][x] = id;
    const f = Terrain.frameOf(id);
    if (f < 0) this.layer.removeTileAt(x, y);
    else this.layer.putTileAt(f, x, y);
  }

  // 圆形模板内的格子，附带到中心的距离
  blastCells(cx, cy, radius) {
    const out = [];
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= radius) out.push({ x: cx + dx, y: cy + dy, d });
      }
    return out;
  }

  // 预览：返回会被摧毁的格子 [{x, y, id, def}]
  previewExplosion(cx, cy) {
    const R = CFG.explosionRadius;
    const maxBonus = Math.max(0, ...Tiles.list().map(d => d.blastSensitivity || 0));
    const seeds = [];
    this.blastCells(cx, cy, R + maxBonus).forEach(c => {
      const def = this.def(c.x, c.y);
      if (!def.destructible) return;
      if (c.d <= R + (def.blastSensitivity || 0)) seeds.push({ x: c.x, y: c.y, id: def.id, def });
    });
    // 连锁：从会连锁的种子出发，沿同类格子 4 邻域扩散
    const seen = new Set(seeds.map(c => c.x + ',' + c.y));
    const out = seeds.slice();
    const stack = seeds.filter(c => c.def.chainCollapse);
    while (stack.length) {
      const c = stack.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = c.x + dx, ny = c.y + dy, k = nx + ',' + ny;
        if (seen.has(k) || this.get(nx, ny) !== c.id) return;
        seen.add(k);
        const n = { x: nx, y: ny, id: c.id, def: c.def };
        out.push(n); stack.push(n);
      });
    }
    return out;
  }

  // 执行爆炸，返回被摧毁的格子（用于特效）
  explode(cx, cy) {
    const removed = this.previewExplosion(cx, cy);
    removed.forEach(c => this.set(c.x, c.y, '.'));
    if (removed.length) this.resolveSupport();
    return removed;
  }

  // ---- 支撑检测（纯函数，编辑器也用）----
  // 从所有锚点出发 4 邻域漫延，返回“被撑住”标记数组
  static computeSupport(grid) {
    const h = grid.length, w = grid[0].length;
    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (Tiles.get(grid[y][x])?.anchor) { seen[y * w + x] = 1; stack.push([x, y]); }
    while (stack.length) {
      const [x, y] = stack.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        if (seen[ny * w + nx] || !Tiles.get(grid[ny][nx])?.solid) return;
        seen[ny * w + nx] = 1; stack.push([nx, ny]);
      });
    }
    return seen;
  }

  // 给编辑器：整张地图里一开始就会掉落的格子
  static findUnsupported(rows) {
    const grid = rows.map(r => r.split('').map(c => Tiles.has(c) ? c : '.'));
    const seen = Terrain.computeSupport(grid);
    const out = [];
    grid.forEach((row, y) => row.forEach((c, x) => { if (Tiles.get(c).canFall && !seen[y * grid[0].length + x]) out.push({ x, y }); }));
    return out;
  }

  // 没被撑住的可掉落格子 → 按连通块分组变成碎块
  resolveSupport() {
    const seen = Terrain.computeSupport(this.grid);
    const idx = (x, y) => y * this.w + x;
    const grouped = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!Tiles.get(this.grid[y][x]).canFall || seen[idx(x, y)] || grouped[idx(x, y)]) continue;
        const cells = []; const st = [[x, y]]; grouped[idx(x, y)] = 1;
        while (st.length) {
          const [px, py] = st.pop();
          cells.push({ x: px, y: py, id: this.grid[py][px] });
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) return;
            if (grouped[idx(nx, ny)] || seen[idx(nx, ny)] || !Tiles.get(this.grid[ny][nx]).canFall) return;
            grouped[idx(nx, ny)] = 1; st.push([nx, ny]);
          });
        }
        this.spawnChunk(cells);
      }
  }

  spawnChunk(cells) {
    cells.forEach(c => this.set(c.x, c.y, '.'));
    const container = this.scene.add.container(0, 0).setDepth(5);
    cells.forEach(c => container.add(this.scene.add.image(c.x * this.T + this.T / 2, c.y * this.T + this.T / 2, 'tiles', Terrain.frameOf(c.id))));
    this.chunks.push({ cells, container, vy: 0, py: 0 });
    this.scene.events.emit('chunk-fall', cells);
  }

  // 碎块每帧更新：整体下落，任一格子下方被挡住就落地并并回格子
  updateChunks(dt) {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      ch.vy = Math.min(ch.vy + CFG.chunkGravity * dt, CFG.chunkMaxFall);
      ch.py += ch.vy * dt;
      let landed = false;
      while (ch.py >= this.T) {
        const blocked = ch.cells.some(c => this.isSolid(c.x, c.y + 1) || this.chunkCellAt(c.x, c.y + 1, ch));
        if (blocked) { landed = true; break; }
        ch.cells.forEach(c => c.y += 1);
        ch.py -= this.T;
      }
      if (landed) {
        ch.py = 0;
        ch.container.destroy();
        ch.cells.forEach(c => this.set(c.x, c.y, c.id));
        this.chunks.splice(i, 1);
        this.scene.events.emit('chunk-land', ch.cells);
        this.resolveSupport();
      } else {
        ch.container.y = ch.py;
        ch.container.list.forEach((img, k) => { img.y = ch.cells[k].y * this.T + this.T / 2; });
      }
    }
  }

  chunkCellAt(x, y, except) {
    return this.chunks.some(ch => ch !== except && ch.cells.some(c => c.x === x && c.y === y));
  }

  // 房间重置：恢复矩形内的格子，清掉范围内的碎块
  resetRect(x0, y0, w, h) {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      if (ch.cells.some(c => c.x >= x0 && c.x < x0 + w && c.y >= y0 && c.y < y0 + h)) { ch.container.destroy(); this.chunks.splice(i, 1); }
    }
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        if (this.grid[y][x] !== this.original[y][x]) this.set(x, y, this.original[y][x]);
    this.resolveSupport();
  }

  forEachChunkCell(fn) {
    const T = this.T;
    this.chunks.forEach(ch => ch.cells.forEach(c => fn(ch, c.x * T, c.y * T + ch.py, T, T)));
  }

  cellsOverlapRect(cells, rect) {
    const T = this.T;
    return cells.some(c => rect.x < c.x * T + T && rect.x + rect.width > c.x * T && rect.y < c.y * T + T && rect.y + rect.height > c.y * T);
  }
}
