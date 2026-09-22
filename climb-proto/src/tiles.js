// ===== 所有砖块与物件的注册 =====
// 想加新砖块：照着写一个 defineTile，其余系统自动认识它（地形、爆炸、掉落、贴图、编辑器物品栏）。

// ---------- 砖块 ----------
defineTile({
  id: '.', name: '空气 / 橡皮', desc: '什么都没有',
  color: 0x000000,
});

defineTile({
  id: '#', name: '泥土', desc: '爆炸范围内会被炸掉；没连到岩石就会掉落',
  color: 0x8d5a3b,
  draw(g, x, y, T) {
    g.fillStyle(0x8d5a3b, 1); g.fillRect(x, y, T, T);
    g.fillStyle(0x6f452c, 1);
    g.fillRect(x + 4, y + 6, 6, 4); g.fillRect(x + 18, y + 12, 8, 4); g.fillRect(x + 8, y + 22, 6, 4); g.fillRect(x + 22, y + 24, 5, 3);
    g.fillStyle(0xa56f4a, 1); g.fillRect(x, y, T, 3);
  },
}, Traits.Solid, Traits.Destructible(0));

defineTile({
  id: 'R', name: '岩石', desc: '炸不动，也是唯一的锚点',
  color: 0x5d6470,
  draw(g, x, y, T) {
    g.fillStyle(0x5d6470, 1); g.fillRect(x, y, T, T);
    g.fillStyle(0x474d57, 1);
    g.fillRect(x + 2, y + 4, 12, 10); g.fillRect(x + 18, y + 16, 12, 12); g.fillRect(x + 4, y + 20, 8, 8);
    g.fillStyle(0x7a828f, 1); g.fillRect(x, y, T, 2);
  },
}, Traits.Solid, Traits.Anchor);

defineTile({
  id: 'B', name: '脆岩', desc: '比泥土多一格感应范围，被波及就整段连锁崩塌',
  color: 0xc9b27c,
  draw(g, x, y, T) {
    g.fillStyle(0xc9b27c, 1); g.fillRect(x, y, T, T);
    g.lineStyle(2, 0x8a7448, 1);
    g.beginPath(); g.moveTo(x + 4, y + 2); g.lineTo(x + 14, y + 14); g.lineTo(x + 8, y + 28); g.strokePath();
    g.beginPath(); g.moveTo(x + 28, y + 4); g.lineTo(x + 18, y + 18); g.lineTo(x + 26, y + 30); g.strokePath();
  },
}, Traits.Solid, Traits.Destructible(1), Traits.Chain);

defineTile({
  id: 'S', name: '沙土', desc: '像泥土，但爆炸范围外一圈也会被震碎（不连锁）',
  color: 0xd9a066,
  draw(g, x, y, T) {
    g.fillStyle(0xd9a066, 1); g.fillRect(x, y, T, T);
    g.fillStyle(0xc4884f, 1);
    for (let i = 0; i < 10; i++) g.fillRect(x + ((i * 7) % 28) + 2, y + ((i * 11) % 26) + 3, 3, 3);
    g.fillStyle(0xe8b77f, 1); g.fillRect(x, y, T, 3);
  },
}, Traits.Solid, Traits.Destructible(1));

defineTile({
  id: 'X', name: '尖刺', desc: '碰到即死；掉下来的地块会把它盖住',
  color: 0xef476f,
  draw(g, x, y, T) {
    g.fillStyle(0xef476f, 1);
    for (let k = 0; k < 4; k++) g.fillTriangle(x + k * 8, y + T, x + k * 8 + 4, y + T - 14, x + k * 8 + 8, y + T);
  },
}, Traits.Hazard('扎到尖刺了'));

// ---------- 物件 ----------
defineEntity({
  id: 'P', name: '出生点', desc: '玩家从这里开始（全图唯一）', unique: true, texture: 'player',
  draw(g) {
    g.fillStyle(0x4cc9f0, 1); g.fillRoundedRect(0, 0, 22, 38, 5);
    g.fillStyle(0x0b0b14, 1); g.fillRect(13, 9, 5, 5);
    return { w: 22, h: 38 };
  },
  spawn(scene, wx, wy) { scene.spawnPoints.push({ x: wx, y: wy }); },
});

defineEntity({
  id: 'M', name: '怪物', desc: '在房间里巡逻，碰到即死；会被落石压扁', texture: 'enemy',
  draw(g) {
    g.fillStyle(0x9b5de5, 1); g.fillRoundedRect(0, 0, 28, 24, 7);
    g.fillStyle(0xffffff, 1); g.fillRect(6, 7, 5, 5); g.fillRect(17, 7, 5, 5);
    g.fillStyle(0x0b0b14, 1); g.fillRect(8, 9, 2, 2); g.fillRect(19, 9, 2, 2);
    return { w: 28, h: 24 };
  },
  spawn(scene, wx, wy, cell) {
    const sp = { x: wx, y: wy, rx: cell.rx, ry: cell.ry };
    scene.enemySpawns.push(sp); scene.spawnEnemy(sp);
  },
});

defineEntity({
  id: 'G', name: '终点', desc: '碰到即通关，上面会画一座建筑', texture: 'door',
  draw(g) {
    g.fillStyle(0xffd166, 1); g.fillRoundedRect(0, 0, 24, 32, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.fillStyle(0x0b0b14, 1); g.fillRoundedRect(4, 6, 16, 26, { tl: 8, tr: 8, bl: 0, br: 0 });
    return { w: 24, h: 32 };
  },
  spawn(scene, wx, wy) {
    scene.goal = { x: wx, y: wy };
    scene.add.image(wx, wy, 'door').setDepth(2);
    scene.drawBuilding(wx, wy + CFG.TILE / 2);
  },
});
