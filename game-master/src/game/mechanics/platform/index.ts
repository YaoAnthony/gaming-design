// ===== 层机制：平台跳（默认） =====
import { defineMechanic } from '../define';
import { Platform } from './Platform';

defineMechanic({
  id: 'platform', name: '平台跳', desc: '有重力，左右走，起跳即爆炸（默认）',
  scope: 'floor', controls: 'jump', aliases: ['platform'],
  create: ctx => new Platform(ctx),
});
