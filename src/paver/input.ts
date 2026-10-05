/**
 * Input for desktop and phones.
 *
 * Desktop: WASD to walk, mouse to look (pointer lock when the page allows it), click to act and
 * hold to keep laying as you sweep across the bed. Without pointer lock (for example inside an
 * embedded frame), drag to look and click to act at the cursor.
 *
 * Touch: a floating joystick on the left half; on the right half, drag to look and tap to act
 * where you tap. Press and hold, then drag, to keep laying under your finger.
 */

export interface ActionEvent {
  /** Screen position (CSS px) to act at, or null for the crosshair. */
  x: number | null;
  y: number | null;
  /** True while sweeping (continuous laying). */
  sweep: boolean;
}

export class Input {
  readonly keys = new Set<string>();
  /** Accumulated look delta in CSS px since the last frame. */
  lookX = 0;
  lookY = 0;
  /** Joystick vector, -1..1. */
  moveX = 0;
  moveY = 0;
  locked = false;
  /** Current sweep position while a sweep is held. */
  sweep: ActionEvent | null = null;
  onAction: (e: ActionEvent) => void = () => {};
  onKey: (code: string) => void = () => {};
  onUnlock: () => void = () => {};
  readonly touch: boolean;

  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private looks = new Map<
    number,
    {
      x: number;
      y: number;
      sx: number;
      sy: number;
      t: number;
      moved: boolean;
      sweeping: boolean;
      timer: number;
    }
  >();
  private readonly stickEl: HTMLElement;
  private readonly knobEl: HTMLElement;
  private mouseDown = false;

  constructor(private readonly el: HTMLElement) {
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.stickEl = document.createElement('div');
    this.stickEl.className = 'stick';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'knob';
    this.stickEl.appendChild(this.knobEl);
    document.body.appendChild(this.stickEl);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.onKey(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.sweep = null;
    });

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === el;
      if (was && !this.locked) {
        this.sweep = null;
        this.onUnlock();
      }
    });
    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock(): void {
    if (this.touch) return;
    try {
      const p = this.el.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      // Not allowed here: drag-to-look still works.
    }
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      this.mouseDown = true;
      if (this.locked) {
        this.sweep = { x: null, y: null, sweep: true };
        this.onAction({ x: null, y: null, sweep: false });
        return;
      }
    }
    // Fingers and Apple Pencil both get the joystick on the left.
    const left = e.pointerType !== 'mouse' && e.clientX < window.innerWidth * 0.42;
    if (left && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickEl.style.display = 'block';
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.knobEl.style.transform = 'translate(-50%, -50%)';
      return;
    }
    const look = {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t: performance.now(),
      moved: false,
      sweeping: false,
      timer: 0,
    };
    // Press and hold without moving: start a sweep.
    look.timer = window.setTimeout(() => {
      if (!look.moved) {
        look.sweeping = true;
        this.sweep = { x: look.x, y: look.y, sweep: true };
        this.onAction({ x: look.x, y: look.y, sweep: false });
      }
    }, 280);
    this.looks.set(e.pointerId, look);
  }

  private move(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && this.locked) {
      this.lookX += e.movementX;
      this.lookY += e.movementY;
      return;
    }
    if (e.pointerId === this.stickId) {
      const dx = e.clientX - this.stickOrigin.x;
      const dy = e.clientY - this.stickOrigin.y;
      const r = 50;
      const l = Math.hypot(dx, dy);
      const k = l > r ? r / l : 1;
      this.moveX = (dx * k) / r;
      this.moveY = (dy * k) / r;
      this.knobEl.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
      return;
    }
    const look = this.looks.get(e.pointerId);
    if (!look) return;
    if (look.sweeping) {
      look.x = e.clientX;
      look.y = e.clientY;
      this.sweep = { x: e.clientX, y: e.clientY, sweep: true };
      return;
    }
    if (!look.moved && Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > 8) {
      look.moved = true;
      clearTimeout(look.timer);
    }
    if (look.moved) {
      this.lookX += e.clientX - look.x;
      this.lookY += e.clientY - look.y;
    }
    look.x = e.clientX;
    look.y = e.clientY;
  }

  private up(e: PointerEvent): void {
    if (e.pointerType === 'mouse') this.mouseDown = false;
    if (e.pointerType === 'mouse' && this.locked) {
      this.sweep = null;
      return;
    }
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.moveX = 0;
      this.moveY = 0;
      this.stickEl.style.display = 'none';
      return;
    }
    const look = this.looks.get(e.pointerId);
    if (!look) return;
    clearTimeout(look.timer);
    this.looks.delete(e.pointerId);
    if (look.sweeping) {
      this.sweep = null;
      return;
    }
    if (!look.moved && performance.now() - look.t < 600) {
      this.onAction({ x: e.clientX, y: e.clientY, sweep: false });
    }
  }

  get holding(): boolean {
    return this.mouseDown || this.sweep !== null;
  }

  consumeLook(): { dx: number; dy: number } {
    const d = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return d;
  }
}
