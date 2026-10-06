import { describe, expect, it } from 'vitest';
import { handBones, type P3 } from '@/stage3d/fx/crumple/handBones';

const len = (a: P3, b: P3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('骷髅手的骨架', () => {
  it('张开时是平的：所有骨头都在 z = 0 上', () => {
    const { bones, knobs } = handBones(0);
    for (const b of bones) { expect(b.a[2]).toBeCloseTo(0, 6); expect(b.b[2]).toBeCloseTo(0, 6); }
    for (const k of knobs) expect(k.at[2]).toBeCloseTo(0, 6);
  });

  it('握拳时手指朝手心（-z）弯过去，指尖绕回到拳心附近', () => {
    const open = handBones(0), fist = handBones(1);
    const tip = (h: typeof open, finger: number) => h.bones[finger * 4 + 3].b;   // 每根手指 4 根骨头：掌骨 + 三节
    for (let f = 0; f < 4; f++) {
      expect(tip(fist, f)[2]).toBeLessThan(-10);
      expect(Math.hypot(tip(fist, f)[0], tip(fist, f)[1])).toBeLessThan(Math.hypot(tip(open, f)[0], tip(open, f)[1]));
    }
  });

  it('弯的时候骨头不变长', () => {
    const open = handBones(0), half = handBones(0.5), fist = handBones(1);
    open.bones.forEach((b, i) => {
      expect(len(half.bones[i].a, half.bones[i].b)).toBeCloseTo(len(b.a, b.b), 4);
      expect(len(fist.bones[i].a, fist.bones[i].b)).toBeCloseTo(len(b.a, b.b), 4);
    });
  });

  it('骨头和骨节的数量不随握拳程度变（每帧只挪位置，不重建）', () => {
    const a = handBones(0), b = handBones(0.7);
    expect(b.bones.length).toBe(a.bones.length);
    expect(b.knobs.length).toBe(a.knobs.length);
  });
});
