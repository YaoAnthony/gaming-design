// ===== 桌面版的存档文件（主进程用；纯 Node，不依赖 Electron，单独能测）=====
// 每一份存成 <用户数据目录>/<文件夹>/<名字>.json：
// - save → save/save.json：玩家的进度和设置。Steam 自动云同步（Auto-Cloud）只同步这个文件，见 docs/desktop.md
//   从 Steam 启动、认得出是哪个 Steam 账号（electron/steam.cjs）：save/<64 位 SteamID>/save.json，一台电脑上几个 Steam 账号各存各的、各同步各的
// - editor → workspace/editor.json：开发期编辑器的工作区（桌面版其实用不到），不同步
// 写的时候先写到 .tmp 再改名（写到一半断电也不会留下半个文件），旧的那份留成 .bak；读的时候主文件坏了就读 .bak。
const fs = require('node:fs');
const path = require('node:path');

/** 每一份放在哪个文件夹里（同时也是能存的名字的白名单） */
const FOLDERS = { save: 'save', editor: 'workspace' };

/** Steam 账号的文件夹名：只认 64 位 SteamID（一串数字），别的一律当没有 */
const isUser = user => typeof user === 'string' && /^\d{1,20}$/.test(user);

/** 这一份的文件路径；名字不认识就抛错（防止渲染进程借这个口子写别的地方）。user = Steam 账号（只影响 save） */
function fileOf(base, name, user) {
  if (typeof name !== 'string' || !Object.hasOwn(FOLDERS, name)) throw new Error(`unknown save: ${String(name)}`);
  const dir = name === 'save' && isUser(user) ? path.join(base, FOLDERS[name], user) : path.join(base, FOLDERS[name]);
  return path.join(dir, `${name}.json`);
}

const isJson = text => { try { JSON.parse(text); return true; } catch { return false; } };

/** 读这一份的原文；没有、或者主文件和备份都坏了是 null */
function read(base, name, user) {
  const file = fileOf(base, name, user);
  for (const f of [file, `${file}.bak`]) {
    try {
      const text = fs.readFileSync(f, 'utf8');
      if (isJson(text)) return text;
    } catch { /* 没有这个文件：看下一个 */ }
  }
  return null;
}

/** 写这一份。成功返回 true，失败返回原因（不是 JSON、名字不对、磁盘写不进去） */
function write(base, name, text, user) {
  try {
    if (typeof text !== 'string' || !isJson(text)) return 'not json';
    const file = fileOf(base, name, user), tmp = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, text, 'utf8');
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * 第一次认出这个 Steam 账号：他自己的文件夹里还没有存档、外面那份公共的有（接 Steam 之前玩的），就复制一份过去。
 * 公共的那份留着不动（别的账号第一次来也能接着用）。返回有没有复制
 */
function adoptShared(base, user) {
  if (!isUser(user)) return false;
  const mine = fileOf(base, 'save', user);
  if (fs.existsSync(mine)) return false;
  const shared = read(base, 'save');
  if (!shared) return false;
  return write(base, 'save', shared, user) === true;
}

module.exports = { FOLDERS, fileOf, read, write, adoptShared, isUser };
