/** The end-of-job card: rating bricks and a short summary. */
import { Container, Graphics } from 'pixi.js';
import type { Score } from '../core/scoring';
import type { Ctx } from './ctx';
import { Button, panel, ratingBrick, text } from './ui';
import { THEME } from './theme';
import { ease } from './tween';

export interface ResultsOptions {
  title: string;
  score: Score | null;
  onContinue: () => void;
  onReplay?: () => void;
  continueLabel?: string;
}

export function resultsCard(
  ctx: Ctx,
  opts: ResultsOptions,
): { node: Container; reveal: () => Promise<void> } {
  const node = new Container();
  const w = Math.min(340, ctx.layout.width - 40);
  const h = opts.score ? 300 : 210;
  node.addChild(panel(w, h));
  const title = text(opts.title, { fontSize: 24, fontWeight: '800' });
  title.anchor.set(0.5);
  title.y = -h / 2 + 42;
  node.addChild(title);
  const bricks = new Graphics();
  const filled: Graphics[] = [];
  if (opts.score) {
    const bw = 62;
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * (bw + 16);
      ratingBrick(bricks, x, -h / 2 + 108, bw, false);
      const f = new Graphics();
      ratingBrick(f, 0, 0, bw, true);
      f.position.set(x, -h / 2 + 108);
      f.visible = false;
      filled.push(f);
    }
    node.addChild(bricks, ...filled);
    const s = opts.score;
    const lines = [
      `${s.bricksUsed} bricks · ${s.offcutsReused} offcut${s.offcutsReused === 1 ? '' : 's'} reused`,
      `${Math.round(s.cleanShare * 100)}% clean cuts`,
    ];
    lines.forEach((l, i) => {
      const t = text(l, { fontSize: 16, fill: THEME.inkSoft, fontWeight: '600' });
      t.anchor.set(0.5);
      t.y = -h / 2 + 160 + i * 24;
      node.addChild(t);
    });
  }
  const btnY = h / 2 - 48;
  const cont = new Button(
    {
      label: opts.continueLabel ?? 'Continue',
      icon: 'check',
      width: opts.onReplay ? 170 : 210,
      height: 54,
      fill: THEME.leaf,
      color: 0xffffff,
    },
    opts.onContinue,
  );
  cont.position.set(opts.onReplay ? 40 : 0, btnY);
  node.addChild(cont);
  if (opts.onReplay) {
    const rep = new Button({ icon: 'replay', width: 54, height: 54 }, opts.onReplay);
    rep.position.set(-w / 2 + 60, btnY);
    node.addChild(rep);
  }
  node.position.set(ctx.layout.width / 2, ctx.layout.height / 2);
  node.alpha = 0;
  node.eventMode = 'static';
  const reveal = async (): Promise<void> => {
    await ctx.tweens.add(
      ctx.motion(0.3),
      (v) => {
        node.alpha = v;
        node.scale.set(0.92 + 0.08 * v);
      },
      { ease: ease.outBack },
    ).promise;
    if (!opts.score) return;
    for (let i = 0; i < opts.score.rating; i++) {
      await ctx.tweens.wait(ctx.motion(0.28));
      const f = filled[i]!;
      f.visible = true;
      ctx.sfx.chime(i);
      ctx.haptics.impact(i === 2 ? 'medium' : 'light');
      await ctx.tweens.add(
        ctx.motion(0.3),
        (v) => {
          f.scale.set(1.5 - 0.5 * v);
          f.alpha = v;
        },
        { ease: ease.outBack },
      ).promise;
    }
  };
  return { node, reveal };
}
