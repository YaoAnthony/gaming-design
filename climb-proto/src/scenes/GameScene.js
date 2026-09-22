// 房间制世界：一屏一个小关卡，R 只重置当前房间；死亡也只重置当前房间
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  // data: { model?, startRoom?: {rx, ry}, playtest?: bool }
  init(data) {
    data = data || {};
    this.model = data.model || WorldModel.default();
    this.startRoom = data.startRoom || null;
    this.playtest = !!data.playtest;
  }

  create() {
    const T = CFG.TILE;
    this.dead = false; this.won = false;
    this.jumps = 0; this.destroyed = 0;
    this.lastGroundedAt = -9999; this.jumpPressedAt = -9999; this.inputLockUntil = 0;
    this.lastGroundCell = null;

    const rows = WorldModel.rows(this.model);
    this.roomW = this.model.roomW; this.roomH = this.model.roomH;
    this.terrain = new Terrain(this, rows);
    const levelW = this.terrain.w * T, levelH = this.terrain.h * T;
    this.physics.world.setBounds(0, 0, levelW, levelH);
    this.roomPxW = this.roomW * T; this.roomPxH = this.roomH * T;

    this.buildBackground(levelW, levelH);

    // 怪物组要先建好，物件 spawn 时会用到
    this.enemies = this.physics.add.group();
    this.physics.add.collider(this.enemies, this.terrain.layer);

    // 物件：每个字符问注册表，由物件自己决定怎么进场
    this.spawnPoints = []; this.enemySpawns = []; this.goal = null;
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      const cls = classify(c);
      if (cls.kind !== 'entity') return;
      cls.def.spawn(this, x * T + T / 2, y * T + T / 2, { x, y, rx: Math.floor(x / this.roomW), ry: Math.floor(y / this.roomH) });
    }));

    // 出生点：优先试玩起始房间里的，其次全图第一个，再不行放在起始房间中央
    let start = null;
    if (this.startRoom) start = this.spawnPoints.find(p => this.roomOf(p.x, p.y).rx === this.startRoom.rx && this.roomOf(p.x, p.y).ry === this.startRoom.ry) || null;
    if (!start) start = this.spawnPoints[0] || null;
    if (!start && this.startRoom) start = { x: (this.startRoom.rx + 0.5) * this.roomPxW, y: (this.startRoom.ry + 0.3) * this.roomPxH };
    if (!start) start = { x: 2 * T, y: 4 * T };

    // 玩家
    this.player = this.physics.add.sprite(start.x, start.y, 'player').setDepth(10);
    this.player.body.setSize(22, 38);
    this.physics.add.collider(this.player, this.terrain.layer);

    // 房间与相机
    this.cameras.main.setBounds(0, 0, levelW, levelH);
    this.room = null;
    this.entry = { x: start.x, y: start.y, vx: 0, vy: 0 };
    this.enterRoom(this.roomOf(start.x, start.y), true);

    // 输入
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ A: 'A', D: 'D', W: 'W', SPACE: 'SPACE', R: 'R' });
    const press = () => { this.jumpPressedAt = this.time.now; };
    this.input.keyboard.on('keydown-SPACE', press);
    this.input.keyboard.on('keydown-UP', press);
    this.input.keyboard.on('keydown-W', press);
    this.input.keyboard.on('keydown-R', () => { if (!this.won) this.resetRoom(); });
    if (this.playtest) this.input.keyboard.on('keydown-ESC', () => this.scene.start('Editor'));

    // 预览层 + 特效
    this.preview = this.add.graphics().setDepth(8);
    this.particles = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 220 }, angle: { min: 0, max: 360 }, lifespan: { min: 250, max: 500 },
      scale: { start: 1, end: 0 }, gravityY: 600, emitting: false,
    }).setDepth(9);
    this.events.on('chunk-fall', () => this.flash('地形断裂！', '#ffd166'));
    this.events.on('chunk-land', (cells) => {
      this.cameras.main.shake(120, 0.004);
      if (!this.dead && !this.won && this.terrain.cellsOverlapRect(cells, this.player.body)) this.die('被落石埋住了');
      this.enemies.children.each(e => { if (e.active && this.terrain.cellsOverlapRect(cells, e.body)) this.killEnemy(e); });
    });

    // HUD
    this.hudBg = this.add.rectangle(0, 0, CFG.viewW, 30, 0x000000, 0.45).setOrigin(0).setScrollFactor(0).setDepth(19);
    this.hudText = this.add.text(10, 7, '', { fontSize: '15px', fontFamily: 'monospace', color: '#ffffff' }).setScrollFactor(0).setDepth(20);
    this.add.rectangle(0, CFG.viewH - 26, CFG.viewW, 26, 0x000000, 0.45).setOrigin(0).setScrollFactor(0).setDepth(19);
    this.add.text(10, CFG.viewH - 20, '←→/AD 移动   空格/W 起跳（起跳点爆炸）   滑墙时按跳 = 蹬墙跳   R 重置本房间' + (this.playtest ? '   ESC 回编辑器' : ''),
      { fontSize: '12px', fontFamily: 'monospace', color: '#c0c4d4' }).setScrollFactor(0).setDepth(20);
    this.msgText = this.add.text(CFG.viewW / 2, 64, '', { fontSize: '22px', fontFamily: 'monospace', color: '#ffd166' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(20).setAlpha(0);
    this.roomText = this.add.text(CFG.viewW / 2, 100, '', { fontSize: '16px', fontFamily: 'monospace', color: '#9ad1ff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(20).setAlpha(0);
    this.showRoomName();
  }

  // ---------- 房间 ----------
  roomOf(x, y) { return { rx: Math.floor(x / this.roomPxW), ry: Math.floor(y / this.roomPxH) }; }
  roomRect(r) { return { x0: r.rx * this.roomW, y0: r.ry * this.roomH, w: this.roomW, h: this.roomH }; }

  enterRoom(r, instant) {
    this.room = r;
    const sx = r.rx * this.roomPxW, sy = r.ry * this.roomPxH;
    this.tweens.killTweensOf(this.cameras.main);
    if (instant) this.cameras.main.setScroll(sx, sy);
    else this.tweens.add({ targets: this.cameras.main, scrollX: sx, scrollY: sy, duration: CFG.roomPanMs, ease: 'Sine.out' });
  }

  showRoomName() {
    const key = WorldModel.keyAt(this.model, this.room.rx, this.room.ry);
    this.roomText.setText(`房间 ${key}：${WorldModel.nameOf(this.model, key)}`).setAlpha(1);
    this.tweens.killTweensOf(this.roomText);
    this.tweens.add({ targets: this.roomText, alpha: 0, delay: 2200, duration: 500 });
  }

  // 进入新房间时记录入口状态（位置 + 速度），重置时回到这个状态
  onRoomChanged(r) {
    const p = this.player, T = CFG.TILE;
    const nx = Phaser.Math.Clamp(p.x, r.rx * this.roomPxW + T * 0.6, (r.rx + 1) * this.roomPxW - T * 0.6);
    const ny = Phaser.Math.Clamp(p.y, r.ry * this.roomPxH + T * 0.6, (r.ry + 1) * this.roomPxH - T * 0.6);
    this.prevEntry = this.entry;   // 入口本身就致命时可退回上一个房间的入口
    this.entry = { x: nx, y: ny, vx: p.body.velocity.x, vy: p.body.velocity.y };
    this.enterRoom(r, false);
    this.showRoomName();
  }

  resetRoom() {
    const rr = this.roomRect(this.room);
    this.terrain.resetRect(rr.x0, rr.y0, rr.w, rr.h);
    // 重生本房间的怪物
    this.enemies.children.each(e => { if (e.active && e.spawn.rx === this.room.rx && e.spawn.ry === this.room.ry) e.destroy(); });
    this.enemySpawns.filter(sp => sp.rx === this.room.rx && sp.ry === this.room.ry).forEach(sp => this.spawnEnemy(sp));
    const p = this.player;
    p.clearTint(); p.body.moves = true;
    p.setPosition(this.entry.x, this.entry.y); p.setVelocity(this.entry.vx, this.entry.vy);
    this.dead = false; this.inputLockUntil = 0; this.lastGroundedAt = -9999; this.jumpPressedAt = -9999;
    this.lastResetAt = this.time.now;
    this.flash('房间已重置', '#9ad1ff');
  }

  // ---------- 怪物 ----------
  spawnEnemy(sp) {
    const e = this.enemies.create(sp.x, sp.y + 2, 'enemy').setDepth(9);
    e.spawn = sp; e.dir = -1; e.body.setSize(26, 22);
    e.setVelocityX(e.dir * CFG.enemySpeed);
  }

  killEnemy(e) {
    if (!e.active) return;
    this.particles.explode(14, e.x, e.y);
    this.flash('怪物被压扁了', '#9b5de5');
    e.destroy();
  }

  updateEnemies() {
    const T = CFG.TILE;
    this.enemies.children.each(e => {
      if (!e.active) return;
      const b = e.body;
      // 不离开自己的房间
      const roomL = e.spawn.rx * this.roomPxW + T, roomR = (e.spawn.rx + 1) * this.roomPxW - T;
      if (b.blocked.left || b.left <= roomL) e.dir = 1;
      else if (b.blocked.right || b.right >= roomR) e.dir = -1;
      else if (b.blocked.down) {
        // 前方没有地面就掉头
        const frontX = Math.floor((e.dir > 0 ? b.right + 2 : b.left - 2) / T);
        const belowY = Math.floor((b.bottom + 2) / T);
        if (!this.terrain.isSolid(frontX, belowY)) e.dir = -e.dir;
      }
      e.setVelocityX(e.dir * CFG.enemySpeed); e.setFlipX(e.dir > 0);
      // 落石压怪
      let crushed = false;
      this.terrain.forEachChunkCell((ch, cx, cy, w, h) => {
        if (ch.vy >= CFG.crushMinSpeed && Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(cx, cy, w, h), new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) crushed = true;
      });
      if (crushed) this.killEnemy(e);
      // 碰到玩家
      else if (!this.dead && !this.won && Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height), new Phaser.Geom.Rectangle(this.player.body.x, this.player.body.y, this.player.body.width, this.player.body.height))) this.die('被怪物抓住了');
    });
  }

  // ---------- 背景 / 建筑 ----------
  buildBackground(levelW, levelH) {
    if (!this.textures.exists('sky')) {
      const c = this.textures.createCanvas('sky', 4, 256);
      const ctx = c.context;
      const grd = ctx.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#5b7fb5'); grd.addColorStop(0.4, '#23305a'); grd.addColorStop(1, '#0b0b14');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 4, 256); c.refresh();
    }
    this.add.image(0, 0, 'sky').setOrigin(0).setDisplaySize(levelW, levelH).setDepth(-10);
    for (let i = 0; i < 160; i++) {
      this.add.circle(Phaser.Math.Between(0, levelW), Phaser.Math.Between(0, levelH * 0.8),
        Phaser.Math.Between(1, 2), 0xffffff, Phaser.Math.FloatBetween(0.15, 0.6)).setDepth(-9);
    }
  }

  drawBuilding(cx, baseY) {
    const T = CFG.TILE;
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0x151a2e, 1);
    g.fillRect(cx - 4 * T, baseY - 9 * T, 8 * T, 9 * T);
    g.fillRect(cx - 1.5 * T, baseY - 13 * T, 3 * T, 4 * T);
    g.fillTriangle(cx - 1.5 * T, baseY - 13 * T, cx + 1.5 * T, baseY - 13 * T, cx, baseY - 15.5 * T);
    g.fillStyle(0xffd166, 0.85);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) g.fillRect(cx - 3 * T + k * 2.5 * T + 8, baseY - 8 * T + r * 2 * T + 6, 20, 28);
    g.fillRect(cx - 10, baseY - 12 * T + 8, 20, 28);
    g.fillStyle(0xffd166, 0.08); g.fillCircle(cx, baseY - 8 * T, 7 * T);
  }

  flash(text, color) {
    this.msgText.setText(text).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.msgText);
    this.tweens.add({ targets: this.msgText, alpha: 0, delay: 700, duration: 400 });
  }

  // ---------- 爆炸 ----------
  detonate(cx, cy) {
    const T = CFG.TILE;
    const removed = this.terrain.explode(cx, cy);
    this.destroyed += removed.length;
    removed.forEach(c => this.particles.explode(6, c.x * T + T / 2, c.y * T + T / 2));
    this.cameras.main.shake(90, 0.006);
    const ring = this.add.circle(cx * T + T / 2, cy * T + T / 2, T * 0.4, 0xffffff, 0.5).setDepth(9);
    this.tweens.add({ targets: ring, scale: CFG.explosionRadius * 2.2, alpha: 0, duration: 220, onComplete: () => ring.destroy() });
  }

  groundCell() {
    const b = this.player.body, T = CFG.TILE;
    return { x: Math.floor(b.center.x / T), y: Math.floor((b.bottom + 1) / T) };
  }
  wallCell(side) {
    const b = this.player.body, T = CFG.TILE;
    const x = side > 0 ? Math.floor((b.right + 1) / T) : Math.floor((b.left - 1) / T);
    return { x, y: Math.floor(b.center.y / T) };
  }

  drawPreview(cell) {
    const T = CFG.TILE, g = this.preview;
    g.clear();
    if (!cell) return;
    g.lineStyle(1, 0xffffff, 0.25);
    this.terrain.blastCells(cell.x, cell.y, CFG.explosionRadius).forEach(c => g.strokeRect(c.x * T + 1, c.y * T + 1, T - 2, T - 2));
    this.terrain.previewExplosion(cell.x, cell.y).forEach(c => {
      g.fillStyle(0xffffff, 0.35); g.fillRect(c.x * T, c.y * T, T, T);
      g.fillStyle(c.def.color, 0.6); g.fillRect(c.x * T + 4, c.y * T + 4, T - 8, T - 8);
    });
  }

  // 玩家与下落碎块：快的压死；慢的（刚断裂）把玩家顶开，当作天花板
  handleChunkContact() {
    const b = this.player.body;
    let crushed = false;
    this.terrain.forEachChunkCell((ch, cx, cy, w, h) => {
      if (crushed) return;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(cx, cy, w, h), new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) return;
      if (ch.vy >= CFG.crushMinSpeed) { crushed = true; return; }
      const overlapY = (cy + h) - b.y;
      if (overlapY > 0 && overlapY < h) { this.player.y += overlapY; if (b.velocity.y < 0) this.player.setVelocityY(0); }
    });
    if (crushed) this.die('被落石压住了');
  }

  // 返回碰到的危险格子的死亡提示，没有则 null
  touchingHazard() {
    const b = this.player.body, T = CFG.TILE;
    const pts = [[b.left + 3, b.bottom - 2], [b.right - 3, b.bottom - 2], [b.center.x, b.center.y], [b.left + 3, b.top + 2], [b.right - 3, b.top + 2]];
    for (const [x, y] of pts) { const h = this.terrain.def(Math.floor(x / T), Math.floor(y / T)).hazard; if (h) return h; }
    return null;
  }

  update(time, delta) {
    const dt = delta / 1000;
    const p = this.player, b = p.body;

    this.terrain.updateChunks(dt);
    this.updateEnemies();

    if (this.dead || this.won) { this.drawPreview(null); return; }

    // 房间切换
    const r = this.roomOf(p.x, p.y);
    if (r.rx !== this.room.rx || r.ry !== this.room.ry) this.onRoomChanged(r);

    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const onGround = b.blocked.down;
    const onWallL = !onGround && b.blocked.left;
    const onWallR = !onGround && b.blocked.right;

    if (time >= this.inputLockUntil) {
      if (left) { p.setVelocityX(-CFG.moveSpeed); p.setFlipX(true); }
      else if (right) { p.setVelocityX(CFG.moveSpeed); p.setFlipX(false); }
      else p.setVelocityX(0);
    }

    if ((onWallL || onWallR) && b.velocity.y > CFG.wallSlideMaxFall) p.setVelocityY(CFG.wallSlideMaxFall);

    if (onGround) { this.lastGroundedAt = time; this.lastGroundCell = this.groundCell(); }
    const canCoyote = time - this.lastGroundedAt <= CFG.coyoteMs && this.lastGroundCell;
    const wantsJump = time - this.jumpPressedAt <= CFG.jumpBufferMs;

    if (wantsJump) {
      if (onGround || canCoyote) {
        const cell = onGround ? this.groundCell() : this.lastGroundCell;
        p.setVelocityY(CFG.jumpVelocity);
        this.afterJump(cell);
      } else if (onWallL || onWallR) {
        const side = onWallR ? 1 : -1;
        const cell = this.wallCell(side);
        p.setVelocityX(-side * CFG.wallJumpX);
        p.setVelocityY(CFG.wallJumpY);
        p.setFlipX(side > 0);
        this.inputLockUntil = time + CFG.wallJumpLockMs;
        this.afterJump(cell);
      }
    }

    if (onGround) this.drawPreview(this.groundCell());
    else if (onWallR) this.drawPreview(this.wallCell(1));
    else if (onWallL) this.drawPreview(this.wallCell(-1));
    else this.drawPreview(null);

    this.handleChunkContact();
    if (this.dead) return;
    const hazard = this.touchingHazard(); if (hazard) return this.die(hazard);
    if (this.goal && Phaser.Math.Distance.Between(p.x, p.y, this.goal.x, this.goal.y) < 24) this.win();

    const key = WorldModel.keyAt(this.model, this.room.rx, this.room.ry);
    this.hudText.setText(`房间 ${key}   跳跃 ${this.jumps}   摧毁 ${this.destroyed} 格   [R] 重置本房间`);
  }

  afterJump(cell) {
    this.jumps += 1;
    this.jumpPressedAt = -9999;
    this.lastGroundedAt = -9999;
    this.detonate(cell.x, cell.y);
  }

  die(reason) {
    if (this.dead) return;
    this.dead = true;
    // 刚重置就死 = 入口本身致命（比如掉进隔壁房间正好落在尖刺上）→ 退回上一个房间的入口
    if (this.lastResetAt != null && this.time.now - this.lastResetAt < 400 && this.prevEntry) {
      this.entry = this.prevEntry; this.prevEntry = null;
      const r = this.roomOf(this.entry.x, this.entry.y);
      if (r.rx !== this.room.rx || r.ry !== this.room.ry) this.enterRoom(r, false);
    }
    this.player.setTint(0xef476f); this.player.setVelocity(0, 0); this.player.body.moves = false;
    this.flash(reason, '#ef476f');
    this.cameras.main.shake(200, 0.01);
    this.time.delayedCall(550, () => { if (this.dead) this.resetRoom(); });
  }

  win() {
    if (this.won) return;
    this.won = true;
    this.player.setVelocity(0, 0); this.player.body.moves = false;
    this.add.text(CFG.viewW / 2, CFG.viewH / 2 - 40, '到达建筑！', { fontSize: '40px', fontFamily: 'monospace', color: '#ffd166' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(30);
    this.add.text(CFG.viewW / 2, CFG.viewH / 2 + 10, `跳跃 ${this.jumps} 次，摧毁 ${this.destroyed} 格地形` + (this.playtest ? '   ESC 回编辑器' : ''),
      { fontSize: '18px', fontFamily: 'monospace', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(30);
  }
}
