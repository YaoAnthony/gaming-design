// ===== 层机制：吃豆人（俯视） =====
// 这一层没有重力，沿格子中线四方向走；豆子、大力丸、四只鬼、葡萄、穿屏隧道。
// 豆子吃光之后是一段剧本：鬼提速永久追击 → 骷髅王画外音 → 解锁炸弹 → 鬼全灭 → 骷髅王登场。
import { defineMechanic } from '../define';
import { PacMan } from './PacMan';

const pacman = defineMechanic({
  id: 'pacman', name: '吃豆人', desc: '俯视、无重力，沿格子四方向走',
  scope: 'floor', controls: 'dpad', aliases: ['topdown'],
  roomFlags: [{ key: 'wrapX', label: '左右打通（隧道）' }],
  create: ctx => new PacMan(ctx),
});

pacman.entity({ id: 'o', name: '豆子', desc: '吃一颗 10 分。房间里的豆子吃光会触发后面的剧情', texture: 'pellet', color: 0xffe8b0, spawn: (pm, at) => pm.addPellet(at, false) });
pacman.entity({ id: 'O', name: '大力丸', desc: '50 分，鬼全部变蓝一段时间，可以反吃', texture: 'power', color: 0xffe8b0, spawn: (pm, at) => pm.addPellet(at, true) });
pacman.entity({ id: 'H', name: '鬼巢', desc: '四只鬼从这里出来，被吃后回这里复活。放在巢的门口那一格', texture: 'ghosthouse', color: 0xffb3c6, spawn: (pm, at) => pm.addGhostHouse(at) });
pacman.entity({ id: 'F', name: '葡萄点', desc: '吃到 70 颗和 170 颗豆子时在这里出现葡萄，9 秒内吃到加分', texture: 'grapes', color: 0x9b5de5, spawn: (pm, at) => pm.addFruitPoint(at) });
pacman.entity({ id: '~', name: '隧道格', desc: '鬼经过这里减速；配合房间开关「左右打通」做穿屏隧道。游戏里不可见', texture: 'tunnel', color: 0x4cc9f0, spawn: (pm, at) => pm.addTunnel(at.cell) });
