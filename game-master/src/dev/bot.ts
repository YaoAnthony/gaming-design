// ===== 开发用：程序控制的玩家（自动试玩关卡、测手柄） =====
// 只在开发模式挂到 window.__climb.bot（main.tsx）。浏览器页面在后台时 requestAnimationFrame 不跑，所以把游戏循环停掉，
// 改成一帧帧手动走（game.step），结果可重复。输入走模拟手柄（覆盖 navigator.getGamepads），和真手柄同一条路。
// 骷髅手放人、R 攥纸团这些按真实时间走的动画会卡住手动步进，load 时关掉（config.respawnHandMs = 0、resetCrumple = false，只在内存里）。
//
// 用法（控制台 / javascript_tool）：
//   await __climb.bot.load({ floor: 'f2' })               从 world.json 读这一层，从出生点开始；room: 'B' 从那个房间开始；at: [x, y] 从那一格开始
//   await __climb.bot.load({ level: 'levels/floor2.txt' }) 直接编译文字关卡来玩（不用先写进 world.json）；bot.check(路径) 只检查
//   __climb.bot.view()                                     当前房间的字符画 + 状态（迷雾里看不见的格子画成 ?，reveal: true 全显示）
//   __climb.bot.run('right 3; jump right; land; view')    一串动作，每步之后打一行状态；命令见 COMMANDS
/* eslint-disable @typescript-eslint/no-explicit-any -- 调试工具：直接读场景和机制的内部字段 */
import { getGame } from '@/game/PhaserGame';
import { store } from '@/redux/store';
import { setConfig } from '@/redux/slices/configSlice';
import { SCENE } from '@/game/bridge';
import { asProject } from '@/game/world/WorldModel';

const FRAME = 1000 / 60;
const BUTTON = { A: 0, Y: 3, BACK: 8 };
/** 门的组号 → 字符画里的字符（和 scripts/level.mjs 一样） */
const DOOR_CHARS = ['?', '!', '@', '$', '^', '&', '*', '(', ')', '+'];

export const COMMANDS = `命令（分号或换行分隔）：
  left N / right N     往那边走 N 格（可以是小数），撞墙停住就提前结束
  to X                 走到第 X 列（房间里的列号，0 开始）
  hold DIRS F          按住方向 F 帧：right、left、up、down、none，可以组合 right+down
  （hold / jump 结束时不松手，按着的方向留到下一条命令，方便蹬墙跳；left / right / to 走到就松手停稳；wait、land 先松手）
  jump [DIR] [F]       按一下跳（A）；带方向就在空中一直按着那个方向，F = 按多少帧（默认一直按到落地）
                       贴墙时蹬墙跳：先 hold 往墙那边按着，再 jump 往反方向（jump 按下那一帧还按着墙那边）
  wait F               什么都不按，等 F 帧（60 帧 = 1 秒）
  land                 等到落地（最多 3 秒）
  down                 往下按一下（摘帽子 / 放下钥匙）
  reset                按 Y（和 R 一样：重置房间；死了就复活）
  view                 把当前房间画出来`;

interface Dirs { left?: boolean; right?: boolean; up?: boolean; down?: boolean }

const pad = {
  id: 'Bot Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  axes: [0, 0, 0, 0],
};
let installed = false;
let clock = 0;

/** 模拟手柄、后台也能跑的 requestAnimationFrame（Phaser 启动和 React 的动画要用） */
function install(): void {
  if (installed) return;
  installed = true;
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
  if (document.hidden) {
    window.requestAnimationFrame = cb => window.setTimeout(() => cb(performance.now()), 16);
    window.cancelAnimationFrame = id => window.clearTimeout(id);
  }
}

function setButton(i: number, on: boolean): void { pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; }
function setDirs(d: Dirs): void { pad.axes[0] = d.left ? -1 : d.right ? 1 : 0; pad.axes[1] = d.up ? -1 : d.down ? 1 : 0; }
function release(): void { setDirs({}); pad.buttons.forEach((_, i) => setButton(i, false)); }

function game(): any {
  const g = getGame();
  if (!g) throw new Error('游戏还没启动：先 await bot.load()');
  return g;
}
function scene(): any { return game().scene.getScene(SCENE.game); }
const mech = (name: string): any => scene().mechs?.find((m: any) => m.constructor.name === name);

/** 手动走 n 帧（每帧前刷新模拟手柄的时间戳，Phaser 才会读新的按键） */
function step(n: number): void {
  const g = game();
  g.loop.sleep();
  clock = Math.max(clock, performance.now());
  for (let i = 0; i < n; i++) { pad.timestamp = performance.now(); clock += FRAME; g.step(clock, FRAME); }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(ok: () => boolean, ms: number, what: string): Promise<void> {
  const end = performance.now() + ms;
  while (!ok()) { if (performance.now() > end) throw new Error('等太久：' + what); await sleep(30); }
}

// ---------- 状态 ----------
function player(): any { return scene().player; }

/** 一行状态：脚所在的格（房间里的坐标）、速度、着地 / 贴墙、手上的东西、房间、死没死 */
export function status(): string {
  const sc = scene(), p = player(), b = p.body, T = sc.cfg.tile;
  const cx = Math.floor(b.center.x / T), cy = Math.floor((b.bottom - 1) / T);
  const lx = cx - sc.rooms.current.rx * sc.rooms.w, ly = cy - sc.rooms.current.ry * sc.rooms.h;
  const where = p.onGround ? 'ground' : p.onWallLeft ? 'wall-L' : p.onWallRight ? 'wall-R' : 'air';
  const held = mech('Carry')?.holding?.id ?? '-';
  const hat = mech('Hat')?.wearing ? ' hat' : '';
  const room = sc.model.layout[sc.rooms.current.ry]?.[sc.rooms.current.rx] ?? '?';
  const flags = [sc.respawn.dead && 'DEAD', sc.won && 'WON', sc.leaving && 'LEAVING', sc.respawn.respawning && 'respawning'].filter(Boolean).join(' ');
  return `房间 ${room} 格(${lx},${ly}) 速度(${Math.round(b.velocity.x)},${Math.round(b.velocity.y)}) ${where} 手上:${held}${hat}${flags ? ' ' + flags : ''}`;
}

export function state(): Record<string, unknown> {
  const sc = scene(), p = player(), b = p.body, T = sc.cfg.tile;
  return {
    room: sc.model.layout[sc.rooms.current.ry]?.[sc.rooms.current.rx], rx: sc.rooms.current.rx, ry: sc.rooms.current.ry,
    cell: [Math.floor(b.center.x / T) - sc.rooms.current.rx * sc.rooms.w, Math.floor((b.bottom - 1) / T) - sc.rooms.current.ry * sc.rooms.h],
    px: [Math.round(b.center.x), Math.round(b.bottom)], v: [Math.round(b.velocity.x), Math.round(b.velocity.y)],
    onGround: p.onGround, held: mech('Carry')?.holding?.id ?? null, dead: sc.respawn.dead, won: sc.won, jumps: sc.stats.jumps,
  };
}

/**
 * 当前房间的字符画。砖块用关卡字符（R 岩石、r 碎岩、B 脆岩、S 沙土、X 尖刺、Z 纸、= 字块、_ 木板），
 * 门画成 ! @ $ ^（组 1-4），@@ 之外再叠：P 玩家、M 怪物、1-9 地上的钥匙、b 箱子、h 帽子、C 蜡烛、G 终点、T 城堡、N 骷髅、* 引线头、v 正在掉的碎块。
 * 迷雾里还看不见的格子画成 ?（reveal: true 全显示）
 */
export function view(opts: { reveal?: boolean } = {}): string {
  const sc = scene(), T = sc.cfg.tile, t = sc.terrain, W = sc.rooms.w, H = sc.rooms.h;
  const x0 = sc.rooms.current.rx * W, y0 = sc.rooms.current.ry * H;
  const grid: string[][] = [];
  const doors = new Map<string, number>();
  (mech('Locks')?.data?.doors ?? []).forEach((d: any) => doors.set(`${d.x},${d.y}`, d.group));
  for (let y = 0; y < H; y++) {
    const row: string[] = [];
    for (let x = 0; x < W; x++) {
      const id = t.get(x0 + x, y0 + y);
      row.push(id === '%' ? DOOR_CHARS[doors.get(`${x0 + x},${y0 + y}`) ?? 0] ?? '%' : id);
    }
    grid.push(row);
  }
  const put = (wx: number, wy: number, ch: string) => {
    const x = Math.floor(wx / T) - x0, y = Math.floor(wy / T) - y0;
    if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = ch;
  };
  sc.fuses?.endsNear({ x: x0 + W / 2, y: y0 + H / 2 }, W + H, true).forEach((e: any) => {
    const x = e.x - x0, y = e.y - y0;
    if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = '*';
  });
  t.forEachChunkCell?.((_ch: any, px: number, py: number, w: number, h: number) => put(px + w / 2, py + h / 2, 'v'));
  mech('Goal')?.goals?.forEach((g: any) => put(g.x, g.y, 'G'));
  mech('Portals')?.portals?.forEach((g: any) => put(g.x, g.y, 'T'));
  mech('Npcs')?.npcs?.forEach((n: any) => { if (n.sprite.active) put(n.sprite.x, n.sprite.y - T / 2, 'N'); });
  mech('Hat')?.ground?.forEach((h: any) => put(h.sprite.x, h.sprite.y - 4, 'h'));
  mech('PushBlocks')?.list?.forEach((bl: any) => {
    const b = bl.sprite.body;
    for (let yy = b.top + 4; yy < b.bottom; yy += T) for (let xx = b.left + 4; xx < b.right; xx += T) put(xx, yy, 'b');
  });
  mech('Carry')?.ground?.forEach((g: any) => put(g.x, g.y, g.carry.key !== undefined ? String(g.carry.key) : 'C'));
  sc.enemies.list().forEach((e: any) => put(e.body.center.x, e.body.center.y, 'M'));
  const pb = player().body;
  put(pb.center.x, pb.bottom - 1, 'P');
  if (!opts.reveal && sc.fog) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!sc.fog.isKnown(x0 + x, y0 + y)) grid[y][x] = '?';
  const tens = '   ' + Array.from({ length: W }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10)) : ' ')).join('');
  const ones = '   ' + Array.from({ length: W }, (_, x) => String(x % 10)).join('');
  const body = grid.map((r, y) => String(y).padStart(2) + ' ' + r.join('')).join('\n');
  return `${tens}\n${ones}\n${body}\n${status()}`;
}

// ---------- 动作 ----------
function parseDirs(s: string | undefined): Dirs {
  const d: Dirs = {};
  (s ?? '').split('+').forEach(k => { if (k === 'left' || k === 'right' || k === 'up' || k === 'down') d[k] = true; });
  return d;
}

/** 手柄的读数比游戏逻辑晚一帧：松手之后人还会按原来的速度再走两帧（约 8 像素），停下来要提前这么多 */
const COAST_PX = 8;

/** 按住方向走，直到横着走了 dist 像素或者被挡住；到了就松手、等人停稳（走位要准，不带着方向进下一条命令） */
function walk(dir: 1 | -1, dist: number): void {
  const p = player(), start = p.body.center.x;
  let stuck = 0, last = start;
  setDirs(dir > 0 ? { right: true } : { left: true });
  for (let i = 0; i < 600 && Math.abs(p.body.center.x - start) < dist - COAST_PX; i++) {
    step(1);
    if (scene().respawn.dead) break;
    stuck = Math.abs(p.body.center.x - last) < 0.5 ? stuck + 1 : 0;
    last = p.body.center.x;
    if (stuck > 6) break;
  }
  release(); step(3);
}

/**
 * 按一下跳，方向一直按着（贴墙时前一条命令按着的方向还没松，物理这一帧还贴着墙，才会蹬墙跳）。
 * 结束时不松手：下一条命令开头自己设按键
 */
function jump(dirs: Dirs, frames?: number): void {
  const p = player();
  setButton(BUTTON.A, true); step(1); setButton(BUTTON.A, false);
  setDirs(dirs);
  const max = frames ?? 180;
  for (let i = 1; i < max; i++) {
    step(1);
    if (scene().respawn.dead) break;
    if (frames === undefined && i > 3 && p.onGround) break;
  }
}

async function reset(): Promise<void> {
  release();
  if (scene().respawn.dead) step(24);   // 刚死的 0.3 秒里不响应
  setButton(BUTTON.Y, true); step(1); setButton(BUTTON.Y, false); step(2);
  for (let i = 0; i < 300 && (scene().respawn.respawning || scene().crumple.active); i++) step(1);
  step(5);
}

/** 一串动作；返回每步之后的状态（view 命令把字符画也放进去） */
export async function run(script: string): Promise<string> {
  const out: string[] = [];
  for (const raw of script.split(/[;\n]/)) {
    const cmd = raw.trim(); if (!cmd) continue;
    const [op, a, b] = cmd.split(/\s+/);
    const T = scene().cfg.tile;
    if (op === 'left' || op === 'right') walk(op === 'right' ? 1 : -1, Number(a ?? 1) * T);
    else if (op === 'to') {
      const sc = scene(), target = (sc.rooms.current.rx * sc.rooms.w + Number(a)) * T + T / 2, p = player();
      const dir = target > p.body.center.x ? 1 : -1;
      walk(dir, Math.abs(target - p.body.center.x));
    } else if (op === 'hold') { setDirs(parseDirs(a)); step(Number(b ?? 1)); }
    else if (op === 'jump') { const n = Number(a); if (a !== undefined && !Number.isNaN(n)) jump({}, n); else jump(parseDirs(a), b === undefined ? undefined : Number(b)); }
    else if (op === 'wait') { release(); step(Number(a ?? 1)); }
    else if (op === 'land') { release(); for (let i = 0; i < 180 && !player().onGround && !scene().respawn.dead; i++) step(1); }
    else if (op === 'down') { setDirs({ down: true }); step(2); release(); step(1); }
    else if (op === 'reset') await reset();
    else if (op === 'view') { out.push(view()); continue; }
    else { out.push(`不认识的命令：${cmd}\n${COMMANDS}`); break; }
    out.push(`${cmd.padEnd(16)} → ${status()}`);
    if (scene().respawn.dead) { out.push('死了（reset 复活）'); break; }
    if (scene().won) { out.push('通关了'); break; }
  }
  return out.join('\n');
}

/** 编译一个文字关卡（levels/*.txt，格式见 levels/README.md），返回只有这一层的项目；有错直接抛出来 */
async function compileFile(path: string) {
  const bust = `t=${Date.now()}`;
  const text = await (await fetch(`/${path}?${bust}`)).text();   // 开发服务器把 .txt 原样给出来
  const fmt = await import(/* @vite-ignore */ `/scripts/levelFormat.mjs?${bust}`);
  const { lv, errors } = fmt.parseLevel(text);
  const c = fmt.compileLevel(lv);
  const all = [...errors, ...c.errors];
  if (all.length) throw new Error('关卡有错：\n' + all.join('\n'));
  return asProject({ floors: [c.floor] });
}

/** 检查一个文字关卡：拼好的整层字符画 + 提醒 + 错误（不开始玩） */
export async function check(path: string): Promise<string> {
  const bust = `t=${Date.now()}`;
  const text = await (await fetch(`/${path}?${bust}`)).text();   // 开发服务器把 .txt 原样给出来
  const fmt = await import(/* @vite-ignore */ `/scripts/levelFormat.mjs?${bust}`);
  const { lv, errors } = fmt.parseLevel(text);
  const c = fmt.compileLevel(lv);
  return [fmt.stitch(lv), ...c.warnings.map((w: string) => '提醒：' + w), ...[...errors, ...c.errors].map((e: string) => '错误：' + e)].join('\n');
}

/**
 * 读 world.json（开发服务器的 /__climb/load-map）或者一个文字关卡（level: 'levels/floor2.txt'），从某一层开始玩。
 * room: 从这个房间开始（有出生点就站出生点，没有就找个能站的地方）；at: [x, y] 从这一格开始（整层的格坐标）。
 * held / hat / stage 和编辑器试玩一样
 */
export async function load(opts: { level?: string; floor?: string; room?: string; at?: [number, number]; held?: string; hat?: boolean; stage?: number } = {}): Promise<string> {
  install();
  store.dispatch(setConfig({ respawnHandMs: 0, resetCrumple: false }));
  if (!getGame()) (document.querySelector('.title-screen') as HTMLElement | null)?.click();
  await until(() => !!getGame()?.scene.isActive(SCENE.game), 15000, '游戏启动');
  const project = opts.level ? await compileFile(opts.level) : asProject(await (await fetch('/__climb/load-map')).json());
  if (!project) throw new Error('world.json 读不出来');
  const floor = project.floors.find(f => f.id === (opts.floor ?? project.floors[0].id));
  if (!floor) throw new Error(`没有这一层：${opts.floor}（有 ${project.floors.map(f => f.id).join(' ')}）`);
  const T = store.getState().config.tile;
  let startRoom = null;
  if (opts.room) floor.model.layout.forEach((row, ry) => row.forEach((k, rx) => { if (k === opts.room) startRoom = { rx, ry }; }));
  const entry = opts.at ? { x: opts.at[0] * T + T / 2, y: opts.at[1] * T + T / 2, vx: 0, vy: 0 } : null;
  release();
  game().loop.sleep();
  scene().scene.restart({ project, floorId: floor.id, playtest: false, startRoom, entry, held: opts.held, hat: opts.hat, stage: opts.stage });
  for (let i = 0; i < 600 && !(scene().player?.body && !scene().respawn.respawning); i++) step(1);
  step(10);
  return view();
}

export const bot = { load, check, run, view, state, status, step, COMMANDS };
