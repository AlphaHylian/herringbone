/** Shared services handed to every scene, plus the scene manager. */
import { Container, Graphics, type Application } from 'pixi.js';
import type { Haptics } from '../platform/haptics';
import type { Storage } from '../platform/storage';
import type { Sfx } from '../audio/sfx';
import { parseSave, serializeSave, SAVE_KEY, defaultSave, type SaveData } from '../core/save';
import type { Layout } from './layout';
import { Tweens, ease } from './tween';
import { THEME } from './theme';

export class SaveStore {
  data: SaveData = defaultSave();
  constructor(private storage: Storage) {}
  async load(): Promise<void> {
    this.data = parseSave(await this.storage.get(SAVE_KEY));
  }
  async persist(): Promise<void> {
    await this.storage.set(SAVE_KEY, serializeSave(this.data));
  }
  async reset(): Promise<void> {
    const settings = this.data.settings;
    this.data = { ...defaultSave(), settings };
    await this.persist();
  }
}

export type SceneSpec =
  | { name: 'map'; focus?: string }
  | { name: 'job'; levelId: string; review?: boolean }
  | { name: 'freebuild' }
  | { name: 'freejob'; shape: string; pattern: string };

export interface Scene {
  root: Container;
  resize(l: Layout): void;
  update(dt: number): void;
  destroy(): void;
}

export interface Ctx {
  app: Application;
  tweens: Tweens;
  layout: Layout;
  haptics: Haptics;
  sfx: Sfx;
  save: SaveStore;
  goto(spec: SceneSpec): void;
  /** Scale a duration for reduce-motion: decorative motion becomes (nearly) instant. */
  motion(seconds: number): number;
  readonly reduceMotion: boolean;
  /** Debug hooks for tests. */
  debug: Record<string, unknown>;
}

export type SceneFactory = (ctx: Ctx, spec: SceneSpec) => Scene;

export class SceneManager {
  current: Scene | null = null;
  spec: SceneSpec | null = null;
  private fade = new Graphics();
  private busy = false;
  private queued: SceneSpec | null = null;

  constructor(
    private ctx: Ctx,
    private layer: Container,
    private overlay: Container,
    private factory: SceneFactory,
  ) {
    this.overlay.addChild(this.fade);
    this.fade.alpha = 0;
    this.fade.eventMode = 'none';
  }

  async goto(spec: SceneSpec): Promise<void> {
    if (this.busy) {
      this.queued = spec;
      return;
    }
    this.busy = true;
    const { tweens } = this.ctx;
    const d = this.ctx.motion(0.22);
    this.drawFade();
    if (this.current) {
      this.fade.eventMode = 'static';
      await tweens.add(d, (v) => (this.fade.alpha = v), { ease: ease.inOutSine }).promise;
      this.current.destroy();
      this.layer.removeChildren();
    }
    this.current = this.factory(this.ctx, spec);
    this.spec = spec;
    this.layer.addChild(this.current.root);
    this.current.resize(this.ctx.layout);
    this.fade.alpha = this.fade.alpha || 0;
    await tweens.add(d, (v) => (this.fade.alpha = 1 - v), { ease: ease.inOutSine }).promise;
    this.fade.alpha = 0;
    this.fade.eventMode = 'none';
    this.busy = false;
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      void this.goto(q);
    }
  }

  resize(): void {
    this.drawFade();
    this.current?.resize(this.ctx.layout);
  }

  private drawFade(): void {
    const { width, height } = this.ctx.layout;
    this.fade.clear().rect(0, 0, width, height).fill(THEME.bg);
  }
}
