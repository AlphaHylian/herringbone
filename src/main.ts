import { Application, Container } from 'pixi.js';
import { initNativeShell } from './platform/native';
import { createHaptics } from './platform/haptics';
import { createStorage } from './platform/storage';
import { WebSfx } from './audio/sfx';
import { readSafeArea, type Layout } from './view/layout';
import { Tweens } from './view/tween';
import { SaveStore, SceneManager, type Ctx, type Scene, type SceneSpec } from './view/ctx';
import { JobScene } from './view/jobScene';
import { getLevel, LEVEL_ORDER } from './levels';
import { resultsCard } from './view/results';
import { THEME } from './view/theme';

async function boot(): Promise<void> {
  const host = document.getElementById('app')!;
  const app = new Application();
  await app.init({
    resizeTo: host,
    background: THEME.bg,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
  });
  host.appendChild(app.canvas);
  app.stage.eventMode = 'static';

  const storage = createStorage();
  const save = new SaveStore(storage);
  await save.load();
  const haptics = createHaptics();
  const sfx = new WebSfx();
  const tweens = new Tweens();
  const layout: Layout = {
    width: app.screen.width,
    height: app.screen.height,
    safe: readSafeArea(),
  };

  const applySettings = (): void => {
    const s = save.data.settings;
    sfx.setVolume(s.volume);
    sfx.setMuted(s.muted);
    haptics.setEnabled(s.haptics);
  };
  applySettings();

  const sceneLayer = new Container();
  const overlay = new Container();
  app.stage.addChild(sceneLayer, overlay);

  const debug: Record<string, unknown> = {};
  const ctx: Ctx = {
    app,
    tweens,
    layout,
    haptics,
    sfx,
    save,
    goto: (spec) => void manager.goto(spec),
    motion: (s) => (save.data.settings.reduceMotion ? s * 0.15 : s),
    get reduceMotion() {
      return save.data.settings.reduceMotion;
    },
    debug,
  };

  const factory = (c: Ctx, spec: SceneSpec): Scene => {
    switch (spec.name) {
      case 'job':
      default: {
        const id = spec.name === 'job' ? spec.levelId : LEVEL_ORDER[0]!;
        const scene = new JobScene(c, getLevel(id), {
          onExit: () => c.goto({ name: 'job', levelId: id }),
        });
        scene.finisher = async (sc) => {
          const card = resultsCard(c, {
            title: 'Job done!',
            score: sc.state.score(),
            onContinue: () => {
              const i = LEVEL_ORDER.indexOf(id);
              c.goto({ name: 'job', levelId: LEVEL_ORDER[(i + 1) % LEVEL_ORDER.length]! });
            },
          });
          sc.overlay.addChild(card.node);
          await card.reveal();
        };
        return scene;
      }
    }
  };
  const manager = new SceneManager(ctx, sceneLayer, overlay, factory);
  debug.manager = manager;
  (window as unknown as { __hb: unknown }).__hb = debug;

  const relayout = (): void => {
    layout.width = app.screen.width;
    layout.height = app.screen.height;
    layout.safe = readSafeArea();
    manager.resize();
  };
  window.addEventListener('resize', () => requestAnimationFrame(relayout));

  app.ticker.add((t) => {
    const dt = Math.min(0.05, t.deltaMS / 1000);
    tweens.update(dt);
    manager.current?.update(dt);
  });

  const params = new URLSearchParams(location.search);
  const levelId = params.get('level');
  await manager.goto({
    name: 'job',
    levelId: levelId && LEVEL_ORDER.includes(levelId) ? levelId : LEVEL_ORDER[1]!,
  });
  debug.ready = true;
  void initNativeShell();
}

void boot();
