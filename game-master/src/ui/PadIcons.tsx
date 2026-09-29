// ===== 手柄图标（像素画）：手柄剪影、A 键、✕ 键 =====
// 每张图是一组字符串，一个字符一个像素：'.' 空，其他字符按调色板上色。画成 SVG，跟着字号缩放，边缘不糊。
import type { ReactElement } from 'react';
import type { PadKind } from '@/game/gamepad';

/** 手柄剪影：肩键、十字键（左边的十字孔）、四个按键（右边的四个孔）、两边握把。只有一种颜色，跟着文字颜色走 */
const CONTROLLER = [
  '...####......####...',
  '.##################.',
  '####################',
  '#####.########.#####',
  '####...######.#.####',
  '#####.########.#####',
  '####################',
  '#######......#######',
  '######........######',
  '.####..........####.',
  '..##............##..',
];

/** 圆按键：b = 按键本身，d = 下沿的暗边（立体感），l = 上面的字（放在亮面的正中） */
const FACE_A = [
  '....bbb....',
  '..bbbbbbb..',
  '.bbblllbbb.',
  '.bblbbblbb.',
  'bbblllllbbb',
  'bbblbbblbbb',
  'bbblbbblbbb',
  '.bbbbbbbbb.',
  '.bbbbbbbbb.',
  '..ddddddd..',
  '....ddd....',
];
const FACE_CROSS = [
  '....bbb....',
  '..bbbbbbb..',
  '.bblbbblbb.',
  '.bbblblbbb.',
  'bbbbblbbbbb',
  'bbbblblbbbb',
  'bbblbbblbbb',
  '.bbbbbbbbb.',
  '.bbbbbbbbb.',
  '..ddddddd..',
  '....ddd....',
];

/** 确认键长什么样：Xbox 式是绿色的 A，PS 是深色底上蓝色的 ✕ */
const FACE: Record<PadKind, { rows: string[]; palette: Record<string, string>; label: string }> = {
  xbox: { rows: FACE_A, palette: { b: '#3fb34f', d: '#23793a', l: '#f4fff2' }, label: 'A' },
  ps: { rows: FACE_CROSS, palette: { b: '#3a4166', d: '#262b45', l: '#8cc4ff' }, label: '✕' },
};

/** 一张像素画：同一行里连着的同色像素合成一个矩形 */
function Pixels({ rows, palette, height, label }: { rows: string[]; palette: Record<string, string>; height: number; label: string }) {
  const w = rows[0].length, h = rows.length;
  const rects: ReactElement[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < w;) {
      const c = row[x];
      let end = x + 1;
      while (end < w && row[end] === c) end++;
      if (c !== '.') rects.push(<rect key={`${x},${y}`} x={x} y={y} width={end - x} height={1} fill={palette[c] ?? 'currentColor'} />);
      x = end;
    }
  });
  return (
    <svg className="pad-icon" viewBox={`0 0 ${w} ${h}`} width={`${(height * w) / h}em`} height={`${height}em`} shapeRendering="crispEdges" role="img" aria-label={label}>
      {rects}
    </svg>
  );
}

/** 手柄剪影（颜色跟着文字走） */
export function ControllerIcon({ height = 1.1 }: { height?: number }) {
  return <Pixels rows={CONTROLLER} palette={{}} height={height} label="controller" />;
}

/** 确认键（A 或 ✕） */
export function ConfirmButtonIcon({ kind, height = 1.15 }: { kind: PadKind; height?: number }) {
  const f = FACE[kind];
  return <Pixels rows={f.rows} palette={f.palette} height={height} label={f.label} />;
}
