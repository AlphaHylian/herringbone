import { describe, expect, it, vi } from 'vitest';
import { Tweens, ease } from '../../src/view/tween';

describe('Tweens', () => {
  it('runs to completion and resolves', async () => {
    const t = new Tweens();
    const seen: number[] = [];
    const tw = t.add(1, (v) => seen.push(v), { ease: ease.linear });
    for (let i = 0; i < 5; i++) t.update(0.25);
    await tw.promise;
    expect(tw.done).toBe(true);
    expect(seen.at(-1)).toBe(1);
  });
  it('honours delays', () => {
    const t = new Tweens();
    const seen: number[] = [];
    t.add(1, (v) => seen.push(v), { ease: ease.linear, delay: 0.5 });
    t.update(0.25);
    expect(seen).toHaveLength(0);
    t.update(0.5);
    expect(seen[0]).toBeCloseTo(0.25);
  });
  it('cancel resolves without finishing; flush finishes everything', async () => {
    const t = new Tweens();
    const a = vi.fn();
    const tw = t.add(1, a);
    tw.cancel();
    await tw.promise;
    t.update(1);
    expect(a).not.toHaveBeenCalled();
    const b = vi.fn();
    t.add(5, b);
    t.flush();
    expect(b).toHaveBeenCalledWith(1);
  });
  it('a throwing update ends that tween but not the others', () => {
    const t = new Tweens();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ok = vi.fn();
    const bad = t.add(1, () => {
      throw new Error('destroyed');
    });
    t.add(1, ok);
    t.update(0.1);
    expect(bad.done).toBe(true);
    expect(ok).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('zero-length tweens complete immediately', () => {
    const t = new Tweens();
    const f = vi.fn();
    expect(t.add(0, f).done).toBe(true);
    expect(f).toHaveBeenCalledWith(1);
  });
});
