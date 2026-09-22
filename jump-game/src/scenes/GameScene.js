class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    const C = GAME_CONFIG;
    this.score = 0;
    this.dead = false;         // scene 重启会复用实例，必须手动重置
    this.physics.resume();
    this.levelWidth = 3200;
    this.lastGroundedAt = 0;
    this.lastJumpPressedAt = -9999;
    this.jumpsLeft = 0;

    // 世界底部多留 200px，让玩家能掉出屏幕而不是踩在世界边界上
    this.physics.world.setBounds(0, 0, this.levelWidth, C.height + 200);
    this.cameras.main.setBackgroundColor('#1a1a2e');

    // 背景装饰：远处的星星
    for (let i = 0; i < 80; i++) {
      const s = this.add.circle(
        Phaser.Math.Between(0, this.levelWidth),
        Phaser.Math.Between(0, C.height - 100),
        Phaser.Math.Between(1, 2), 0xffffff, Phaser.Math.FloatBetween(0.2, 0.8)
      );
      s.setScrollFactor(0.4);
    }

    // 平台
    this.platforms = this.physics.add.staticGroup();
    const layout = [
      // [x, y, tiles]
      [0, 576, 14],
      [700, 470, 3],
      [960, 380, 3],
      [1200, 480, 4],
      [1200, 576, 6],
      [1550, 420, 2],
      [1750, 330, 3],
      [2050, 400, 3],
      [2300, 500, 4],
      [2300, 576, 14],
      [2650, 420, 2],
      [2850, 330, 4],
    ];
    layout.forEach(([x, y, n]) => this.addPlatform(x, y, n));

    // 尖刺
    this.spikes = this.physics.add.staticGroup();
    [[560, 576], [592, 576], [1392, 576], [1424, 576], [2500, 576], [2532, 576], [2564, 576]]
      .forEach(([x, y]) => this.spikes.create(x + 16, y - 12, 'spike'));

    // 金币
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    const coinSpots = [
      [300, 500], [380, 500], [780, 420], [1050, 330], [1300, 430],
      [1600, 370], [1850, 280], [2150, 350], [2400, 450], [2700, 370], [2950, 280], [3020, 280],
    ];
    coinSpots.forEach(([x, y]) => {
      const c = this.coins.create(x, y, 'coin');
      this.tweens.add({ targets: c, y: y - 8, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });

    // 敌人：左右巡逻
    this.enemies = this.physics.add.group({ allowGravity: false });
    [[1250, 462, 1250, 1430], [2320, 482, 2320, 2520]].forEach(([x, y, minX, maxX]) => {
      const e = this.enemies.create(x, y, 'enemy');
      e.setVelocityX(80);
      e.minX = minX; e.maxX = maxX;
    });

    // 终点
    this.flag = this.physics.add.staticImage(3080, 298, 'flag');

    // 玩家
    this.player = this.physics.add.sprite(80, 500, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0);

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, null, this);
    this.physics.add.overlap(this.player, this.spikes, this.die, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.player, this.flag, this.win, null, this);

    // 相机跟随
    this.cameras.main.setBounds(0, 0, this.levelWidth, C.height);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // 输入
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ A: 'A', D: 'D', W: 'W', SPACE: 'SPACE', R: 'R' });
    this.input.keyboard.on('keydown-SPACE', () => this.lastJumpPressedAt = this.time.now);
    this.input.keyboard.on('keydown-UP', () => this.lastJumpPressedAt = this.time.now);
    this.input.keyboard.on('keydown-W', () => this.lastJumpPressedAt = this.time.now);
    this.input.keyboard.on('keydown-R', () => this.scene.restart());

    // HUD
    this.scoreText = this.add.text(16, 16, '金币: 0', { fontSize: '22px', fontFamily: 'monospace', color: '#ffd166' }).setScrollFactor(0);
    this.add.text(16, 44, '← → / A D 移动   空格/↑/W 跳跃(可二段跳)   R 重开', { fontSize: '14px', fontFamily: 'monospace', color: '#aaaaaa' }).setScrollFactor(0);
  }

  addPlatform(x, y, tiles) {
    for (let i = 0; i < tiles; i++) {
      this.platforms.create(x + i * 64 + 32, y + 12, 'platform');
    }
  }

  update(time) {
    const C = GAME_CONFIG;
    const p = this.player;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const onGround = p.body.blocked.down || p.body.touching.down;

    if (left) { p.setVelocityX(-C.playerSpeed); p.setFlipX(true); }
    else if (right) { p.setVelocityX(C.playerSpeed); p.setFlipX(false); }
    else p.setVelocityX(0);

    if (onGround) {
      this.lastGroundedAt = time;
      this.jumpsLeft = C.doubleJump ? 2 : 1;
    }

    const canCoyote = time - this.lastGroundedAt <= C.coyoteTimeMs;
    const wantsJump = time - this.lastJumpPressedAt <= C.jumpBufferMs;

    if (wantsJump && (onGround || canCoyote || this.jumpsLeft > 0)) {
      this.jumpsLeft--;   // 地面起跳消耗第一次，空中消耗第二次（二段跳）
      p.setVelocityY(C.jumpVelocity);
      this.lastJumpPressedAt = -9999;
      this.lastGroundedAt = -9999;
      // 小挤压动画
      this.tweens.add({ targets: p, scaleX: 0.8, scaleY: 1.2, duration: 80, yoyo: true });
    }

    // 敌人巡逻
    this.enemies.children.iterate(e => {
      if (!e) return;
      if (e.x <= e.minX) e.setVelocityX(80);
      if (e.x >= e.maxX) e.setVelocityX(-80);
    });

    // 掉出屏幕
    if (p.y > C.height + 40) this.die();
  }

  collectCoin(player, coin) {
    coin.destroy();
    this.score += 1;
    this.scoreText.setText('金币: ' + this.score);
  }

  hitEnemy(player, enemy) {
    // 从上方踩到敌人 → 消灭；否则死亡
    if (player.body.velocity.y > 0 && player.y < enemy.y - 10) {
      enemy.destroy();
      player.setVelocityY(-350);
      this.score += 2;
      this.scoreText.setText('金币: ' + this.score);
    } else {
      this.die();
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.physics.pause();
    this.player.setTint(0xef476f);
    this.cameras.main.shake(200, 0.01);
    this.time.delayedCall(600, () => this.scene.start('GameOver', { win: false, score: this.score }));
  }

  win() {
    if (this.dead) return;
    this.dead = true;
    this.physics.pause();
    this.time.delayedCall(300, () => this.scene.start('GameOver', { win: true, score: this.score }));
  }
}
