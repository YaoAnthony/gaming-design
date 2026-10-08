// ===== 3D 关卡的数据格式 =====
// 坐标：原点在屏幕（2D 游戏画面）底边的中点，屏幕立在 z = 0 上、正面朝 +z；x 朝右，y 朝上。
// 长度单位是「格」（画面里一格砖那么大）。屏幕本身不写在关卡里：它有多大由 2D 游戏定。

export interface Vec3 { x: number; y: number; z: number }

/** 一个实心方块：at = 底面中心，size = 宽（x）、高（y）、深（z） */
export interface Block3D { at: Vec3; size: Vec3 }

/**
 * 关卡里的演员（world3d/Actors3D）：boss = Game Master 本体（站着，木手挂在手腕上），clip = 夹子桑。
 * at = 脚底中心；yaw = 朝向（度，0 = 朝镜头 +z）；patrol = 在 at 和 to 之间来回走
 */
export interface Actor3D { kind: 'boss' | 'clip'; at: Vec3; yaw?: number; patrol?: { to: Vec3 } }

export interface Level3D {
  id: string;
  /** 实心方块：地面、台子、箱子都是它 */
  blocks: Block3D[];
  /** 站在关卡里的角色 */
  actors?: Actor3D[];
  /** 掉出关卡（比这个 y 还低）后回到哪 */
  respawn: Vec3;
  killY: number;
  /** 地面上画格线的范围：一个方块顶面（blocks 的下标）、每格多大 */
  grid: { block: number; cell: number };
}
