import { describe, expect, it } from 'vitest';
import reducer, { checkpoint, clearRun, EMPTY_RUN, setFlag, setRealm } from '@/redux/slices/runSlice';

describe('run 切片（存档）', () => {
  it('检查点只改给的那几样，这一局算开始了', () => {
    const a = reducer(EMPTY_RUN, checkpoint({ floorId: 'f2', room: { rx: 1, ry: 0 }, stage: 1 }));
    expect(a).toMatchObject({ active: true, floorId: 'f2', room: { rx: 1, ry: 0 }, stage: 1, hat: false, held: null });
    const b = reducer(a, checkpoint({ hat: true, stats: { jumps: 3, destroyed: 9 } }));
    expect(b).toMatchObject({ floorId: 'f2', stage: 1, hat: true, stats: { jumps: 3, destroyed: 9 } });
  });

  it('跳出画面记下 3D 关卡，回到画面后关卡还留着', () => {
    const out = reducer(EMPTY_RUN, setRealm({ realm: 'deep', levelId: 'desk' }));
    expect(out).toMatchObject({ realm: 'deep', deep: { levelId: 'desk' } });
    expect(reducer(out, setRealm({ realm: 'flat' }))).toMatchObject({ realm: 'flat', deep: { levelId: 'desk' } });
  });

  it('事件标记；清空回到初始', () => {
    const a = reducer(reducer(EMPTY_RUN, checkpoint({ floorId: 'f1' })), setFlag('firstPopOut'));
    expect(a.flags).toEqual({ firstPopOut: true });
    expect(reducer(a, clearRun())).toEqual(EMPTY_RUN);
  });
});
