/** A note from the client, shown before a job starts. Tap anywhere to begin. */
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { Ctx } from './ctx';
import { panel, text } from './ui';
import { THEME } from './theme';
import { ease } from './tween';
import { drawSwatch } from './swatch';
import { PATTERN_NAMES, type PatternType } from '../core/patterns';

export function showClientNote(
  ctx: Ctx,
  parent: Container,
  note: string,
  pattern: PatternType,
  onDone: () => void,
): void {
  const l = ctx.layout;
  const root = new Container();
  const dim = new Graphics().rect(0, 0, l.width, l.height).fill({ color: 0x2a1e14, alpha: 0.3 });
  root.addChild(dim);
  const w = Math.min(340, l.width - 36);
  const card = new Container();
  const body = text(`“${note}”`, {
    fontSize: 19,
    fontStyle: 'italic',
    fontWeight: '600',
    wordWrap: true,
    wordWrapWidth: w - 48,
    lineHeight: 26,
    fill: THEME.ink,
  });
  const h = body.height + 150;
  card.addChild(panel(w, h, 0xfffaf0, 18));
  // a strip of tape
  const tape = new Graphics()
    .roundRect(-44, -h / 2 - 12, 88, 26, 4)
    .fill({ color: 0xe8d8a8, alpha: 0.85 });
  tape.rotation = -0.04;
  card.addChild(tape);
  const from = text('From the client', { fontSize: 14, fill: THEME.inkSoft, fontWeight: '700' });
  from.position.set(-w / 2 + 24, -h / 2 + 22);
  card.addChild(from);
  body.position.set(-w / 2 + 24, -h / 2 + 50);
  card.addChild(body);
  const sw = new Graphics();
  drawSwatch(sw, pattern, 34);
  const m = new Graphics().roundRect(0, 0, 34, 34, 8).fill(0xffffff);
  const swc = new Container();
  swc.addChild(sw, m);
  sw.mask = m;
  swc.position.set(-w / 2 + 24, h / 2 - 56);
  card.addChild(swc);
  const pname = text(PATTERN_NAMES[pattern], { fontSize: 15, fill: THEME.inkSoft });
  pname.position.set(-w / 2 + 68, h / 2 - 47);
  card.addChild(pname);
  const go = text('Tap to start', { fontSize: 15, fill: THEME.leafDark, fontWeight: '800' });
  go.anchor.set(1, 0);
  go.position.set(w / 2 - 24, h / 2 - 47);
  card.addChild(go);
  card.position.set(l.width / 2, l.height * 0.42);
  root.addChild(card);
  root.eventMode = 'static';
  root.hitArea = new Rectangle(0, 0, l.width, l.height);
  parent.addChild(root);
  root.alpha = 0;
  void ctx.tweens.add(
    ctx.motion(0.3),
    (v) => {
      root.alpha = v;
      card.y = l.height * 0.42 + 20 * (1 - v);
    },
    { ease: ease.outCubic },
  );
  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    ctx.sfx.unlock();
    ctx.sfx.tap();
    void ctx.tweens
      .add(ctx.motion(0.22), (v) => {
        root.alpha = 1 - v;
        card.y = l.height * 0.42 - 30 * v;
      })
      .promise.then(() => {
        root.destroy({ children: true });
        delete ctx.debug.note;
        onDone();
      });
  };
  root.on('pointerdown', (e) => {
    e.stopPropagation();
    close();
  });
  ctx.debug.note = close;
}
