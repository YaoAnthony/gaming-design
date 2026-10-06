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
});
