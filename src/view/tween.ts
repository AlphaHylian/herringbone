/** A tiny tween runner driven by the Pixi ticker. No allocations per frame beyond the list. */
export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
} satisfies Record<string, Ease>;

export interface Tween {
  cancel(): void;
  readonly done: boolean;
  /** Resolves when finished (or cancelled). */
  promise: Promise<void>;
}

interface Active {
  t: number;
  duration: number;
  delay: number;
  ease: Ease;
  update: (v: number) => void;
  resolve: () => void;
  done: boolean;
  onDone?: () => void;
}

export class Tweens {
  private list: Active[] = [];
  /** Global multiplier on durations (0.0001 in reduce-motion mode means "instant"). */
  speed = 1;

  add(
    duration: number,
    update: (v: number) => void,
    opts: { ease?: Ease; delay?: number; onDone?: () => void } = {},
  ): Tween {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    const a: Active = {
      t: 0,
      duration: Math.max(0, duration),
      delay: Math.max(0, opts.delay ?? 0),
      ease: opts.ease ?? ease.outCubic,
      update,
      resolve,
      done: false,
      onDone: opts.onDone,
    };
    if (a.duration === 0 && a.delay === 0) {
      update(1);
      a.done = true;
      opts.onDone?.();
      resolve();
    } else {
      this.list.push(a);
    }
    return {
      cancel: () => {
        if (a.done) return;
        a.done = true;
        resolve();
      },
      get done() {
        return a.done;
      },
      promise,
    };
  }

  wait(seconds: number): Promise<void> {
    return this.add(seconds, () => undefined, { ease: ease.linear }).promise;
  }

  update(dt: number): void {
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (a.done) continue;
      let step = dt;
      if (a.delay > 0) {
        a.delay -= dt;
        if (a.delay > 0) {
          list[w++] = a;
          continue;
        }
        step = -a.delay;
        a.delay = 0;
      }
      a.t += step;
      const k = a.duration <= 0 ? 1 : Math.min(1, a.t / a.duration);
      a.update(a.ease(k));
      if (k >= 1) {
        a.done = true;
        a.onDone?.();
        a.resolve();
      } else {
        list[w++] = a;
      }
    }
    list.length = w;
  }

  /** Finish everything immediately. */
  flush(): void {
    for (const a of this.list) {
      if (a.done) continue;
      a.update(1);
      a.done = true;
      a.onDone?.();
      a.resolve();
    }
    this.list.length = 0;
  }
}
