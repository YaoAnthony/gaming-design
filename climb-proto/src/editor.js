// 地图编辑器的 DOM 部分：物品栏、房间地图、按钮。画布部分在 scenes/EditorScene.js。
const STORAGE_KEY = 'climb-proto-editor-model';

const EditorState = {
  model: null,
  room: { rx: 0, ry: 0 },
  brush: '#',
  showSupport: true,
  scene: null,
  save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.model)); } catch (e) { /* 隐私模式等 */ } },
  load() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) { const m = JSON.parse(s); if (m && m.rooms && m.layout && m.roomW) return m; }
    } catch (e) { /* ignore */ }
    return null;
  },
};
window.EditorState = EditorState;

EditorState.model = EditorState.load() || WorldModel.default();
(function pickStartRoom() {
  const st = WorldModel.findStart(EditorState.model);
  if (st) EditorState.room = { rx: Math.floor(st.x / EditorState.model.roomW), ry: Math.floor(st.y / EditorState.model.roomH) };
})();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: CFG.viewW, height: CFG.viewH,
  parent: 'game-container',
  backgroundColor: '#141a2c',
  pixelArt: true,
  physics: { default: 'arcade', arcade: { gravity: { y: CFG.gravity }, debug: false } },
  scene: [BootScene, EditorScene, GameScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});
game.registry.set('bootNext', 'Editor');
window.game = game;

const $ = (id) => document.getElementById(id);

function restartEditor() { EditorState.save(); game.scene.start('Editor'); }

function iconFor(kind, def) {
  try {
    if (kind === 'tile') return def.frame >= 0 ? game.textures.getBase64('tiles', def.frame) : null;
    return game.textures.getBase64(def.texture);
  } catch (e) { return null; }
}

function buildPalette() {
  const build = (host, kind, defs) => {
    host.innerHTML = '';
    defs.forEach(def => {
      const btn = document.createElement('button');
      btn.className = 'item' + (EditorState.brush === def.id ? ' active' : '');
      btn.title = def.desc;
      btn.dataset.id = def.id;
      const src = iconFor(kind, def);
      const icon = document.createElement('div'); icon.className = 'icon';
      if (src) { const img = document.createElement('img'); img.src = src; icon.appendChild(img); }
      else icon.textContent = def.id === '.' ? '⌫' : def.id;
      const label = document.createElement('div'); label.className = 'label';
      label.innerHTML = `<b>${def.name}</b><small>${def.id}</small>`;
      btn.append(icon, label);
      btn.onclick = () => { EditorState.brush = def.id; document.querySelectorAll('.item').forEach(b => b.classList.toggle('active', b.dataset.id === def.id)); };
      host.appendChild(btn);
    });
  };
  build($('palette-tiles'), 'tile', Tiles.filter(d => d.editor.visible));
  build($('palette-entities'), 'entity', Entities.list());
}

function buildRoomMap() {
  const host = $('roommap'); host.innerHTML = '';
  const m = EditorState.model;
  host.style.gridTemplateColumns = `repeat(${WorldModel.cols(m)}, 1fr)`;
  m.layout.forEach((row, ry) => row.forEach((k, rx) => {
    const b = document.createElement('button');
    b.className = 'room' + (rx === EditorState.room.rx && ry === EditorState.room.ry ? ' active' : '');
    b.textContent = k; b.title = m.names[k] || '';
    b.onclick = () => { EditorState.room = { rx, ry }; restartEditor(); };
    host.appendChild(b);
  }));
  const key = WorldModel.keyAt(m, EditorState.room.rx, EditorState.room.ry);
  $('room-title').textContent = `当前房间 ${key}（第 ${EditorState.room.ry + 1} 排，第 ${EditorState.room.rx + 1} 列）`;
  $('room-name').value = m.names[key] || '';
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) { window.prompt('复制下面的内容：', text); return false; }
}

window.addEventListener('editor-scene-ready', (e) => {
  EditorState.scene = e.detail;
  buildPalette();
  buildRoomMap();
});

window.addEventListener('DOMContentLoaded', () => {
  $('room-name').addEventListener('input', (e) => {
    const m = EditorState.model, key = WorldModel.keyAt(m, EditorState.room.rx, EditorState.room.ry);
    m.names[key] = e.target.value; EditorState.save();
  });
  $('add-row').onclick = () => { WorldModel.addRow(EditorState.model); restartEditor(); };
  $('add-col').onclick = () => { WorldModel.addCol(EditorState.model); restartEditor(); };
  $('play').onclick = () => { EditorState.save(); game.scene.start('Game', { model: EditorState.model, startRoom: EditorState.room, playtest: true }); };
  $('play-start').onclick = () => { EditorState.save(); game.scene.start('Game', { model: EditorState.model, startRoom: null, playtest: true }); };
  $('show-support').checked = EditorState.showSupport;
  $('show-support').onchange = (e) => { EditorState.showSupport = e.target.checked; if (EditorState.scene) EditorState.scene.updateSupport(); };
  $('export').onclick = () => download('world.json', JSON.stringify(EditorState.model, null, 2));
  $('import-btn').onclick = () => $('import').click();
  $('import').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const m = JSON.parse(await f.text());
      if (!m.rooms || !m.layout || !m.roomW) throw new Error('格式不对');
      EditorState.model = m; EditorState.room = { rx: 0, ry: 0 }; restartEditor();
    } catch (err) { alert('导入失败：' + err.message); }
    e.target.value = '';
  };
  $('copy-js').onclick = async () => { const ok = await copyText(WorldModel.toWorldJs(EditorState.model)); if (ok) $('status').textContent = '已复制 world.js 内容到剪贴板'; };
  $('reset').onclick = () => { if (confirm('恢复成默认地图？当前编辑内容会丢失。')) { EditorState.model = WorldModel.default(); const st = WorldModel.findStart(EditorState.model); EditorState.room = st ? { rx: Math.floor(st.x / EditorState.model.roomW), ry: Math.floor(st.y / EditorState.model.roomH) } : { rx: 0, ry: 0 }; restartEditor(); } };
});
