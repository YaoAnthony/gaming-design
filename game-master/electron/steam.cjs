// ===== Steam（可选）：装了 steamworks.js、由 Steam 启动（或者开发时给了 App ID）才接上；接不上就当没有 Steam，游戏照常玩 =====
// 现在只用它认出是哪个 Steam 账号：存档放进 save/<64 位 SteamID>/，Steam 云按账号分开同步（docs/desktop.md）。
// 接上之后顺手打开 Steam 的游戏内界面（Overlay）。成就之类以后从这里加。
//
// App ID 从哪来（按顺序）：环境变量 SteamAppId（Steam 启动游戏时自己设）、GM_STEAM_APP_ID（开发时自己设）。
// 都没有就不接：不在 Steam 里跑的时候不去碰 Steam。

/** @returns {{ appId: number, steamId: string, client: unknown } | null} */
function connect({ env = process.env, load = () => require('steamworks.js'), log = () => {} } = {}) {
  const appId = Number(env.SteamAppId || env.GM_STEAM_APP_ID);
  if (!Number.isInteger(appId) || appId <= 0) return null;
  let sw;
  try { sw = load(); } catch (err) { log(`steamworks.js 没装或这个平台不支持：${err instanceof Error ? err.message : err}`); return null; }
  try {
    const client = sw.init(appId);
    const id = client.localplayer.getSteamId();
    const steamId = String(id.steamId64);
    if (!/^\d+$/.test(steamId) || steamId === '0') return null;
    try { sw.electronEnableSteamOverlay?.(); } catch { /* 没有 Overlay 也能玩 */ }
    return { appId, steamId, client };
  } catch (err) {
    log(`Steam 没接上（没开 Steam、没登录、App ID 不对）：${err instanceof Error ? err.message : err}`);
    return null;
  }
}

module.exports = { connect };
