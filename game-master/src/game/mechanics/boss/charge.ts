// ===== 王之炸药（砖块）=====
// 平时是一块结实的墙：人炸不动、引线烧不坏。Boss 房里的史莱姆王一死，它跟着爆开的火花一起炸（BossFight.detonateCharges）：
// 周围 3x3 的实心方块全没（岩石也是，锁着的门、Boss 封门除外），范围里的引线全点着，挨着的另一块王之炸药接着炸。
import { TILE_FRAMES } from '@/asset';
import { defineTile, Traits } from '@/game/registry/registry';

export const CHARGE = defineTile(
  { id: 'E', name: '王之炸药', desc: '平时是一块结实的墙（人炸不动、引线烧不坏）；Boss 房里的史莱姆王一死，它跟着爆开的火花一起炸：周围 3x3 的方块全没（岩石也是，锁着的门和封门除外），范围里的引线全点着，挨着的另一块王之炸药接着炸', color: 0xef476f, frame: TILE_FRAMES.bossCharge },
  Traits.Solid, Traits.Anchor, Traits.Fireproof,
);
