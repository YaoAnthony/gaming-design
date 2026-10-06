// ===== SteamPipe 的构建脚本（VDF）：纯函数，scripts/steam-upload.mjs 用，测试在 tests/scripts/ =====
// 一个 app 构建 = 一个 app_build_<appid>.vdf + 每个平台一个 depot_build_<depotid>.vdf。
// 内容目录是 electron-builder 打出来的免安装目录（release/win-unpacked、release/mac-universal、release/linux-unpacked）。
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** 每个平台：Steam 的 depot 环境变量、electron-builder 的输出目录（相对 release/）、depot 里要排除的东西 */
export const PLATFORMS = {
  win: { env: 'STEAM_DEPOT_WIN', dir: 'win-unpacked', exclude: ['*.pdb'] },
  mac: { env: 'STEAM_DEPOT_MAC', dir: 'mac-universal', exclude: ['.DS_Store'] },
  linux: { env: 'STEAM_DEPOT_LINUX', dir: 'linux-unpacked', exclude: [] },
};

/** VDF 里的字符串：反斜杠和引号要转义 */
const q = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** 一个 depot 的构建脚本：把 contentRoot 下的所有文件放进这个 depot */
export function depotVdf({ depotId, contentRoot, exclude = [] }) {
  return [
    '"DepotBuild"',
    '{',
    `\t"DepotID" ${q(depotId)}`,
    `\t"ContentRoot" ${q(contentRoot)}`,
    '\t"FileMapping"',
    '\t{',
    '\t\t"LocalPath" "*"',
    '\t\t"DepotPath" "."',
    '\t\t"Recursive" "1"',
    '\t}',
    ...exclude.map(e => `\t"FileExclusion" ${q(e)}`),
    '}',
    '',
  ].join('\n');
}

/**
 * app 构建脚本。branch：传上去之后自动设成哪个分支的当前版本——只允许测试分支（比如 beta），
 * 绝不自动设 default（正式版本要在 Steamworks 后台手动点「设为上线」）。preview = 只算不传（检查用）
 */
export function appVdf({ appId, desc, buildOutput, depots, branch, preview = false }) {
  if (branch && branch.toLowerCase() === 'default') throw new Error('不自动发布到 default 分支：请在 Steamworks 后台手动设为上线');
  return [
    '"AppBuild"',
    '{',
    `\t"AppID" ${q(appId)}`,
    `\t"Desc" ${q(desc)}`,
    `\t"BuildOutput" ${q(buildOutput)}`,
    `\t"Preview" ${q(preview ? 1 : 0)}`,
    ...(branch ? [`\t"SetLive" ${q(branch)}`] : []),
    '\t"Depots"',
    '\t{',
    ...depots.map(d => `\t\t${q(d.depotId)} ${q(d.file)}`),
    '\t}',
    '}',
    '',
  ].join('\n');
}

/**
 * 按环境变量和 release/ 里实际打出来的目录，算出这次要传哪些 depot。
 * 没设 depot 号、或者那个平台没打包的跳过（返回 skipped 说明原因）
 */
export function planDepots(env, releaseDir, exists = existsSync) {
  const depots = [], skipped = [];
  for (const [platform, p] of Object.entries(PLATFORMS)) {
    const depotId = env[p.env];
    const contentRoot = resolve(join(releaseDir, p.dir));
    if (!depotId) { skipped.push(`${platform}：没设 ${p.env}`); continue; }
    if (!/^\d+$/.test(depotId)) throw new Error(`${p.env} 不是数字：${depotId}`);
    if (!exists(contentRoot)) { skipped.push(`${platform}：没有 ${contentRoot}（先 npm run desktop:pack:${platform}）`); continue; }
    depots.push({ platform, depotId, contentRoot, exclude: p.exclude });
  }
  return { depots, skipped };
}
