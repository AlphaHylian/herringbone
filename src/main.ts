import { Application, Container } from 'pixi.js';
import { initNativeShell } from './platform/native';
import { createHaptics } from './platform/haptics';
import { createStorage } from './platform/storage';
import { WebSfx } from './audio/sfx';
import { readSafeArea, type Layout } from './view/layout';
import { Tweens } from './view/tween';
import { SaveStore, SceneManager, type Ctx, type Scene, type SceneSpec } from './view/ctx';
import { JobScene } from './view/jobScene';
import { attachSplitter } from './view/splitter';
import { getLevel, LEVEL_ORDER } from './levels';
import { MapScene } from './view/mapScene';
import { FreeBuildScene, FREE_PALETTES } from './view/freeBuildScene';
import { Tutorial } from './view/tutorial';
import { showClientNote } from './view/clientNote';
import { makeRecord } from './view/persist';
import { Button } from './view/ui';
import { recordCompletion } from './core/save';
import { nextJob } from './core/progress';
import { freeLevel, type FreeShape } from './core/freebuild';
import { validateLevel } from './core/level';
import type { PatternType } from './core/patterns';
import { resultsCard } from './view/results';
import { runFinish } from './view/finish';
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
  sfx.ambient(true);

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

  const params = new URLSearchParams(location.search);
  const deepLink = params.has('level');

  const factory = (c: Ctx, spec: SceneSpec): Scene => {
    switch (spec.name) {
      case 'map':
        return new MapScene(c, spec.focus);
      case 'freebuild':
        return new FreeBuildScene(c);
      case 'freejob': {
        const [pattern, palette] = spec.pattern.split(':') as [PatternType, string];
        const level = validateLevel(
          freeLevel(spec.shape as FreeShape, pattern, FREE_PALETTES[palette] ?? FREE_PALETTES.red!),
        );
        const scene = new JobScene(c, level, {
          free: true,
          onExit: () => c.goto({ name: 'freebuild' }),
        });
        attachSplitter(scene);
        scene.finisher = async (sc) => {
          await runFinish(sc, { cardSpace: 250 });
          const card = resultsCard(c, {
            title: 'Lovely work',
            score: null,
            continueLabel: 'Build another',
            onContinue: () => c.goto({ name: 'freebuild' }),
          });
          card.node.y = c.layout.height - c.layout.safe.bottom - 125;
          sc.overlay.addChild(card.node);
          await card.reveal();
        };
        return scene;
      }
      case 'job': {
        const id = spec.levelId;
        const level = getLevel(id);
        const rec = save.data.completed[id] ?? null;
        if (spec.review) {
          const scene = new JobScene(c, level, {
            review: rec,
            onExit: () => c.goto({ name: 'map', focus: id }),
          });
          const again = new Button(
            { icon: 'replay', label: 'Pave again', width: 200, height: 54, fill: THEME.paper },
            () => c.goto({ name: 'job', levelId: id }),
          );
          const place = (): void => {
            again.position.set(c.layout.width / 2, c.layout.height - c.layout.safe.bottom - 50);
          };
          place();
          scene.ui.addChild(again);
          const resize = scene.resize.bind(scene);
          scene.resize = (l) => {
            resize(l);
            place();
          };
          return scene;
        }
        const scene = new JobScene(c, level, {
          onExit: () => c.goto({ name: 'map', focus: id }),
          onComplete: (state, skins) => {
            save.data = recordCompletion(save.data, id, makeRecord(state, skins));
            void save.persist();
          },
        });
        attachSplitter(scene);
        scene.finisher = async (sc) => {
          await runFinish(sc, { cardSpace: 330 });
          const next = nextJob(LEVEL_ORDER, save.data);
          const card = resultsCard(c, {
            title: 'Job done!',
            score: sc.state.score(),
            onContinue: () => c.goto({ name: 'map', focus: next ?? id }),
            onReplay: () => c.goto({ name: 'job', levelId: id }),
          });
          card.node.y = c.layout.height - c.layout.safe.bottom - 165;
          sc.overlay.addChild(card.node);
          await card.reveal();
        };
        const startTutorial = (): void => {
          const want =
            params.get('tutorial') === '1' ||
            (level.tutorial && !save.data.tutorialDone && !deepLink);
          if (!want) return;
          new Tutorial(scene, () => {
            save.data.tutorialDone = true;
            void save.persist();
          });
        };
        if (deepLink && params.get('note') !== '1') startTutorial();
        else showClientNote(c, scene.overlay, level.clientNote, level.pattern.type, startTutorial);
        return scene;
      }
    }
  };
  const manager = new SceneManager(ctx, sceneLayer, overlay, factory);
  debug.manager = manager;
  debug.sfx = sfx;
  debug.save = save;
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

  const levelId = params.get('level');
  if (levelId && LEVEL_ORDER.includes(levelId))
    await manager.goto({ name: 'job', levelId, review: params.has('review') });
  else if (params.get('scene') === 'freebuild') await manager.goto({ name: 'freebuild' });
  else await manager.goto({ name: 'map' });
  debug.ready = true;
  void initNativeShell();
}

void boot();
