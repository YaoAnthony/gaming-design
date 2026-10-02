import { describe, expect, it } from 'vitest';
import { CrumpleMesh, VERTEX_FLOATS, type CrumpleOptions, type CrumpleState } from './crumpleMesh';

const PAPER: CrumpleOptions = { x: 40, y: 30, w: 400, h: 300, grab: { x: 240, y: 180 }, cell: 20, seed: 3 };
const SIZE = Math.sqrt(PAPER.w * PAPER.h);

function run(opts: CrumpleOptions, state: Partial<CrumpleState>): { mesh: CrumpleMesh; out: Float32Array } {
  const mesh = new CrumpleMesh(opts);
  const out = new Float32Array(mesh.vertexCount * VERTEX_FLOATS);
  mesh.update({ crumple: 0, pinch: 0, squeeze: 0, hand: opts.grab, ...state }, out);
  return { mesh, out };
}

/** 每个顶点：[x, y, z, u, v, 明暗, 露出画面的程度] */
function vertices(out: Float32Array): number[][] {
  const vs: number[][] = [];
  for (let o = 0; o < out.length; o += VERTEX_FLOATS) vs.push(Array.from(out.subarray(o, o + VERTEX_FLOATS)));
  return vs;
}

describe('CrumpleMesh', () => {
  it('没捏的时候就是原图：位置和贴图坐标对得上，平的，亮度不变，全是正面', () => {
    const { out } = run(PAPER, {});
    for (const [x, y, z, u, v, shade, ink] of vertices(out)) {
      expect(x).toBeCloseTo(PAPER.x + u * PAPER.w, 3);
      expect(y).toBeCloseTo(PAPER.y + v * PAPER.h, 3);
      expect(z).toBeCloseTo(0, 5);
      expect(shade).toBeCloseTo(1, 5);
      expect(ink).toBe(1);
    }
  });

  it('捏完是手指下的一团：所有顶点都离捏合点不远', () => {
    const hand = { x: 300, y: 120 };
    const { out } = run(PAPER, { crumple: 1, pinch: 1, squeeze: 1, hand });
    const far = Math.max(...vertices(out).map(([x, y]) => Math.hypot(x - hand.x, y - hand.y)));
    expect(far).toBeLessThan(0.3 * SIZE);
  });

  it('纸团跟着手走：手挪多少，整团挪多少', () => {
    const a = run(PAPER, { crumple: 1, hand: { x: 100, y: 100 } }).out;
    const b = run(PAPER, { crumple: 1, hand: { x: 130, y: 80 } }).out;
    for (let o = 0; o < a.length; o += VERTEX_FLOATS) {
      expect(b[o] - a[o]).toBeCloseTo(30, 3);
      expect(b[o + 1] - a[o + 1]).toBeCloseTo(-20, 3);
    }
  });

  it('整个过程里没有 NaN，明暗和露出程度在范围内', () => {
    for (const crumple of [0, 0.1, 0.35, 0.6, 0.9, 1]) {
      const { out } = run(PAPER, { crumple, pinch: 1, squeeze: crumple });
      for (const [x, y, z, , , shade, ink] of vertices(out)) {
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
        expect(shade).toBeGreaterThanOrEqual(0);
        expect(shade).toBeLessThanOrEqual(1.5);
        expect(ink).toBeGreaterThanOrEqual(0);
        expect(ink).toBeLessThanOrEqual(1);
      }
    }
  });

  it('揉到一半会露出纸的背面或裂开的白纸', () => {
    const { out } = run(PAPER, { crumple: 0.7, pinch: 1 });
    expect(vertices(out).some(v => v[6] < 1)).toBe(true);
  });

  it('扔出去时整团绕球心转、缩：不转不缩和不传一样；缩一半后都在一半的范围里', () => {
    const hand = { x: 250, y: 200 };
    const plain = run(PAPER, { crumple: 1, hand }).out;
    expect(run(PAPER, { crumple: 1, hand, spin: 0, tumble: 0, ballScale: 1 }).out).toEqual(plain);
    const far = (out: Float32Array) => Math.max(...vertices(out).map(([x, y]) => Math.hypot(x - hand.x, y - hand.y)));
    const turned = run(PAPER, { crumple: 1, hand, spin: 2.1, tumble: 0.9, ballScale: 0.5 }).out;
    expect(turned).not.toEqual(plain);
    expect(far(turned)).toBeLessThanOrEqual(far(plain) * 0.5 + 1e-3);
  });

  it('同一个种子捏出来一样，换种子不一样', () => {
    const state = { crumple: 0.5, pinch: 1 };
    expect(run(PAPER, state).out).toEqual(run(PAPER, state).out);
    expect(run({ ...PAPER, seed: 4 }, state).out).not.toEqual(run(PAPER, state).out);
  });
});
