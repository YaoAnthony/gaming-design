import { describe, expect, it } from 'vitest';
import { crateVariant } from '@/world3d/props';

describe('crateVariant', () => {
  it('按高宽比挑木箱', () => {
    expect(crateVariant({ x: 3, y: 1, z: 3 })).toBe('crate_flat');
    expect(crateVariant({ x: 3, y: 2, z: 3 })).toBe('crate_half');
    expect(crateVariant({ x: 3, y: 3, z: 3 })).toBe('crate_cube');
    expect(crateVariant({ x: 4, y: 4, z: 4 })).toBe('crate_cube');
    expect(crateVariant({ x: 2, y: 1, z: 2 })).toBe('crate_half');
  });
});
