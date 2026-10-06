// Steam 是可选的：没有 App ID、没装 steamworks.js、Steam 没开都当没有 Steam；接上了拿到 64 位 SteamID
import { describe, expect, it } from 'vitest';
import steam from '../../electron/steam.cjs';

/** 假的 steamworks.js */
const fakeSw = (steamId64 = 76561198000000001n, overlay = () => {}) => ({
  init: () => ({ localplayer: { getSteamId: () => ({ steamId64, steamId32: 'x', accountId: 1 }) } }),
  electronEnableSteamOverlay: overlay,
});

describe('接 Steam', () => {
  it('没有 App ID：不接，也不去加载 steamworks.js', () => {
    let loaded = false;
    expect(steam.connect({ env: {}, load: () => { loaded = true; return fakeSw(); } })).toBeNull();
    expect(loaded).toBe(false);
  });

  it('Steam 启动游戏时设的 SteamAppId：接上，拿到 SteamID（字符串），打开 Overlay', () => {
    let overlay = false;
    const s = steam.connect({ env: { SteamAppId: '480' }, load: () => fakeSw(76561198000000001n, () => { overlay = true; }) });
    expect(s).toMatchObject({ appId: 480, steamId: '76561198000000001' });
    expect(overlay).toBe(true);
  });

  it('开发时用 GM_STEAM_APP_ID 也行', () => {
    expect(steam.connect({ env: { GM_STEAM_APP_ID: '480' }, load: () => fakeSw() })?.appId).toBe(480);
  });

  it('没装 steamworks.js、Steam 没开（init 抛错）、拿到的 ID 是 0：当没有 Steam', () => {
    const logs = [];
    const log = m => logs.push(m);
    expect(steam.connect({ env: { SteamAppId: '480' }, load: () => { throw new Error('Cannot find module'); }, log })).toBeNull();
    expect(steam.connect({ env: { SteamAppId: '480' }, load: () => ({ init: () => { throw new Error('Steam is not running'); } }), log })).toBeNull();
    expect(steam.connect({ env: { SteamAppId: '480' }, load: () => fakeSw(0n), log })).toBeNull();
    expect(logs.length).toBe(2);
  });

  it('App ID 不对：不接', () => {
    expect(steam.connect({ env: { SteamAppId: 'abc' }, load: () => fakeSw() })).toBeNull();
    expect(steam.connect({ env: { SteamAppId: '0' }, load: () => fakeSw() })).toBeNull();
  });
});
