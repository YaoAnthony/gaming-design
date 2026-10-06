// 桌面版存档文件：写到一半不留半个文件、主文件坏了读备份、名字不认识不让写
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import saves from '../../electron/saveFiles.cjs';

let base;
beforeEach(() => { base = mkdtempSync(path.join(tmpdir(), 'gm-save-')); });
afterEach(() => { rmSync(base, { recursive: true, force: true }); });

describe('桌面版存档文件', () => {
  it('写了能读回来；save 和 editor 放在不同文件夹（只有 save 同步到云）', () => {
    expect(saves.write(base, 'save', '{"a":1}')).toBe(true);
    expect(saves.write(base, 'editor', '{"b":2}')).toBe(true);
    expect(saves.read(base, 'save')).toBe('{"a":1}');
    expect(existsSync(path.join(base, 'save', 'save.json'))).toBe(true);
    expect(existsSync(path.join(base, 'workspace', 'editor.json'))).toBe(true);
  });

  it('没写过：读出来是 null', () => {
    expect(saves.read(base, 'save')).toBeNull();
  });

  it('再写一次：旧的留成 .bak，不留 .tmp', () => {
    saves.write(base, 'save', '{"v":1}');
    saves.write(base, 'save', '{"v":2}');
    const file = saves.fileOf(base, 'save');
    expect(readFileSync(file, 'utf8')).toBe('{"v":2}');
    expect(readFileSync(`${file}.bak`, 'utf8')).toBe('{"v":1}');
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('主文件坏了：读备份', () => {
    saves.write(base, 'save', '{"v":1}');
    saves.write(base, 'save', '{"v":2}');
    writeFileSync(saves.fileOf(base, 'save'), '{broken', 'utf8');
    expect(saves.read(base, 'save')).toBe('{"v":1}');
  });

  it('不是 JSON、名字不认识：不写', () => {
    expect(saves.write(base, 'save', 'not json')).toBe('not json');
    expect(saves.write(base, '../../etc', '{}')).toMatch(/unknown save/);
    expect(() => saves.read(base, 'passwd')).toThrow(/unknown save/);
  });

  it('Steam 账号：save 放进 save/<SteamID>/，几个账号各存各的；editor 不受影响', () => {
    saves.write(base, 'save', '{"who":"a"}', '76561198000000001');
    saves.write(base, 'save', '{"who":"b"}', '76561198000000002');
    expect(saves.read(base, 'save', '76561198000000001')).toBe('{"who":"a"}');
    expect(saves.read(base, 'save', '76561198000000002')).toBe('{"who":"b"}');
    expect(existsSync(path.join(base, 'save', '76561198000000001', 'save.json'))).toBe(true);
    expect(saves.read(base, 'save')).toBeNull();   // 公共的那份没被写
    expect(saves.fileOf(base, 'editor', '76561198000000001')).toBe(path.join(base, 'workspace', 'editor.json'));
  });

  it('Steam 账号不是一串数字：当没有账号（不能借它写到别的目录）', () => {
    expect(saves.fileOf(base, 'save', '../../x')).toBe(path.join(base, 'save', 'save.json'));
    expect(saves.isUser('76561198000000001')).toBe(true);
    expect(saves.isUser('')).toBe(false);
  });

  it('第一次认出 Steam 账号：接 Steam 之前的公共存档复制过去，公共的留着；已经有自己的就不动', () => {
    saves.write(base, 'save', '{"v":"shared"}');
    expect(saves.adoptShared(base, '76561198000000001')).toBe(true);
    expect(saves.read(base, 'save', '76561198000000001')).toBe('{"v":"shared"}');
    expect(saves.read(base, 'save')).toBe('{"v":"shared"}');
    saves.write(base, 'save', '{"v":"mine"}', '76561198000000001');
    expect(saves.adoptShared(base, '76561198000000001')).toBe(false);
    expect(saves.read(base, 'save', '76561198000000001')).toBe('{"v":"mine"}');
  });

  it('没有公共存档：不复制', () => {
    expect(saves.adoptShared(base, '76561198000000003')).toBe(false);
  });
});
