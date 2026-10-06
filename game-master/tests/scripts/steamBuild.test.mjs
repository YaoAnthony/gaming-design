// SteamPipe 构建脚本：VDF 写得对、只传打包好了的平台、绝不自动发布到 default 分支
import { describe, expect, it } from 'vitest';
import { appVdf, depotVdf, planDepots, PLATFORMS } from '../../scripts/steamBuild.mjs';

describe('SteamPipe 构建脚本', () => {
  it('depot：整个目录递归放进去，带排除项；路径里的反斜杠和引号转义', () => {
    const v = depotVdf({ depotId: '1001', contentRoot: 'C:\\game\\win-unpacked', exclude: ['*.pdb'] });
    expect(v).toContain('"DepotID" "1001"');
    expect(v).toContain('"ContentRoot" "C:\\\\game\\\\win-unpacked"');
    expect(v).toContain('"Recursive" "1"');
    expect(v).toContain('"FileExclusion" "*.pdb"');
  });

  it('app：列出每个 depot 的脚本；预览模式；测试分支自动设为当前版本', () => {
    const v = appVdf({ appId: '1000', desc: 'test "x"', buildOutput: '/out', depots: [{ depotId: '1001', file: '/b/d1.vdf' }], branch: 'beta', preview: true });
    expect(v).toContain('"AppID" "1000"');
    expect(v).toContain('"Desc" "test \\"x\\""');
    expect(v).toContain('"Preview" "1"');
    expect(v).toContain('"SetLive" "beta"');
    expect(v).toContain('"1001" "/b/d1.vdf"');
    expect(appVdf({ appId: '1', desc: '', buildOutput: '/o', depots: [] })).not.toContain('SetLive');
  });

  it('不自动发布到 default 分支', () => {
    expect(() => appVdf({ appId: '1', desc: '', buildOutput: '/o', depots: [], branch: 'default' })).toThrow(/default/);
    expect(() => appVdf({ appId: '1', desc: '', buildOutput: '/o', depots: [], branch: 'Default' })).toThrow(/default/);
  });

  it('只传设了 depot 号、并且已经打包好的平台', () => {
    const env = { [PLATFORMS.win.env]: '1001', [PLATFORMS.mac.env]: '1002' };
    const { depots, skipped } = planDepots(env, '/release', p => p.endsWith('win-unpacked'));
    expect(depots.map(d => [d.platform, d.depotId])).toEqual([['win', '1001']]);
    expect(skipped.join('\n')).toMatch(/mac.*desktop:pack:mac/);
    expect(skipped.join('\n')).toMatch(/linux.*STEAM_DEPOT_LINUX/);
  });

  it('depot 号不是数字：报错', () => {
    expect(() => planDepots({ [PLATFORMS.win.env]: 'abc' }, '/release', () => true)).toThrow(/不是数字/);
  });
});
