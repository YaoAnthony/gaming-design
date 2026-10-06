// ===== 游戏画面的前后层次（Phaser 的 depth，大的盖住小的）=====
// 新加的东西先在这里找个位置；不要在别处写新的魔法数字。从下往上：
export const DEPTH = {
  /** 程序画的渐变天空（整层铺一张） */
  sky: -10,
  /** 背景图的第 0 层（最远），往近每层加 backgroundStep；最多 9 层，都在星星下面 */
  background: -9.95,
  backgroundStep: 0.01,
  /** 星空背景的星星（只撒在用星空的房间里） */
  stars: -9,
  /** 光柱、微尘（sceneFx）：在背景之上、地形之下 */
  shafts: -8.5,
  dust: -8,
  /** 出口城堡的剪影 */
  goalSilhouette: -5,
  /** 地形的投影、地形本身、地形的体积感 */
  terrainShadow: -1,
  terrain: 0,
  terrainShade: 0.5,
  /** 暖光（蜡烛之类）：地形、体积感之上，碎块、物件、人之下 */
  warmLight: 4.5,
  /** GM 的化身 */
  storyProp: 2,
  /** 玩家 */
  player: 10,
  /** 迷雾：盖住整个房间 */
  fog: 12,
  /** 节奏关卡（压暗房间 −2、玩法道具、替身 +2、喊话 +3 都相对它）：盖住房间里所有东西 */
  rhythm: 40,
  /** 开场：房间砸下来时扬起的灰（盖住房间里所有东西） */
  openingDust: 60,
} as const;
