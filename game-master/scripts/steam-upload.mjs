// ===== 把打包好的桌面版传到 Steam（SteamPipe，用 steamcmd）=====
//   npm run desktop:pack:win（/ mac / linux）   先打包
//   npm run steam:upload -- --dry-run           只生成构建脚本、打印要跑的命令（不登录、不上传）
//   npm run steam:upload                        真的传
// 需要的环境变量（可以写在 game-master/.env.steam.local，这个文件不进仓库）：
//   STEAM_APP_ID        游戏的 App ID
//   STEAM_DEPOT_WIN / STEAM_DEPOT_MAC / STEAM_DEPOT_LINUX   各平台的 depot 号（没设的平台跳过）
//   STEAM_USER          有上传权限的 Steam 账号（密码和 Steam 令牌由 steamcmd 自己问，第一次登录后会记住）
//   STEAMCMD            steamcmd 的路径（默认就叫 steamcmd，要在 PATH 里）
//   STEAM_BRANCH        可选：传完自动设成这个测试分支的当前版本（比如 beta）；不能是 default
//   STEAM_DESC          可选：这次构建的说明（默认是 git 提交号）
// 正式上线永远在 Steamworks 后台手动点，脚本不会动 default 分支。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appVdf, depotVdf, planDepots } from './steamBuild.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry-run');

// .env.steam.local：KEY=VALUE 一行一个（# 开头是注释）
const envFile = join(ROOT, '.env.steam.local');
const env = { ...process.env };
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const fail = msg => { console.error(`steam:upload：${msg}`); process.exit(1); };
if (!env.STEAM_APP_ID || !/^\d+$/.test(env.STEAM_APP_ID)) fail('没设 STEAM_APP_ID（或者不是数字）');
if (!dry && !env.STEAM_USER) fail('没设 STEAM_USER');

const { depots, skipped } = planDepots(env, join(ROOT, 'release'));
skipped.forEach(s => console.log(`跳过 ${s}`));
if (!depots.length) fail('没有能传的 depot');

let rev = 'local';
try { rev = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch { /* 不在 git 里 */ }
const out = join(ROOT, 'steam', 'build');
mkdirSync(join(out, 'output'), { recursive: true });
const files = depots.map(d => {
  const file = join(out, `depot_build_${d.depotId}.vdf`);
  writeFileSync(file, depotVdf(d));
  return { depotId: d.depotId, file };
});
const appFile = join(out, `app_build_${env.STEAM_APP_ID}.vdf`);
writeFileSync(appFile, appVdf({ appId: env.STEAM_APP_ID, desc: env.STEAM_DESC || `Game Master ${rev}`, buildOutput: join(out, 'output'), depots: files, branch: env.STEAM_BRANCH, preview: dry }));
console.log(`构建脚本：${appFile}`);
depots.forEach(d => console.log(`  ${d.platform} → depot ${d.depotId}：${d.contentRoot}`));

const cmd = env.STEAMCMD || 'steamcmd';
const args = ['+login', env.STEAM_USER || '<STEAM_USER>', '+run_app_build', appFile, '+quit'];
if (dry) { console.log(`\n（--dry-run，不上传）要跑的命令：\n${cmd} ${args.join(' ')}`); process.exit(0); }
const r = spawnSync(cmd, args, { stdio: 'inherit' });
if (r.error) fail(`跑不了 ${cmd}：${r.error.message}（装 steamcmd，或者用 STEAMCMD 指到它）`);
process.exit(r.status ?? 1);
