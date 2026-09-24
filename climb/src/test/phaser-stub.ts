// ===== 单元测试用的 Phaser 替身 =====
// 真 Phaser 一 import 就要 window / canvas，Node 里跑不起来。
// 机制的注册（defineMechanic / entity）和运行时类写在同一个文件夹里，测试只需要注册表，
// 所以 vitest 把 'phaser' 指到这里：任何属性都能取、能当父类 extends，但不会真的被调用。
const cache = new Map<PropertyKey, unknown>();

function stub(path: string): unknown {
  const fn = function PhaserStub() { /* 测试里不会真的构造 */ };
  return new Proxy(fn, {
    get(target, key) {
      if (key === 'prototype') return target.prototype;
      if (typeof key === 'symbol') return undefined;
      const id = `${path}.${key}`;
      if (!cache.has(id)) cache.set(id, stub(id));
      return cache.get(id);
    },
  });
}

const Phaser = stub('Phaser');
export default Phaser;
