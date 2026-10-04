/** Settings overlay: volume, sound, haptics, reduce motion, reset progress. */
import { Container, Graphics, Rectangle } from 'pixi.js';
import type { Ctx } from './ctx';
import { Button, Slider, Toggle, panel, text } from './ui';
import { THEME } from './theme';
import { ease } from './tween';

export function openSettings(
  ctx: Ctx,
  parent: Container,
  onClose: () => void,
  onReset: () => void,
): Container {
  const l = ctx.layout;
  const root = new Container();
  const dim = new Graphics().rect(0, 0, l.width, l.height).fill({ color: 0x2a1e14, alpha: 0.45 });
  dim.eventMode = 'static';
  dim.hitArea = new Rectangle(0, 0, l.width, l.height);
  const w = Math.min(350, l.width - 32);
  const h = 470;
  const card = new Container();
  card.addChild(panel(w, h));
  card.position.set(l.width / 2, Math.max(l.safe.top + h / 2 + 10, l.height / 2));
  card.eventMode = 'static';
  card.on('pointerdown', (e) => e.stopPropagation());
  const title = text('Settings', { fontSize: 24, fontWeight: '800' });
  title.anchor.set(0.5);
  title.y = -h / 2 + 38;
  card.addChild(title);
  const s = ctx.save.data.settings;
  const persist = (): void => void ctx.save.persist();
  const row = (y: number, label: string): number => {
    const t = text(label, { fontSize: 18, fill: THEME.ink });
    t.anchor.set(0, 0.5);
    t.position.set(-w / 2 + 26, y);
    card.addChild(t);
    return y;
  };
  let y = -h / 2 + 96;
  row(y, 'Volume');
  const slider = new Slider(w * 0.42, s.volume, (v) => {
    s.volume = v;
    ctx.sfx.setVolume(v);
    persist();
  });
  slider.position.set(w / 2 - 26 - w * 0.42, y);
  card.addChild(slider);
  slider.on('pointerup', () => ctx.sfx.clack(0.8));
  y += 58;
  row(y, 'Sound');
  const sound = new Toggle(!s.muted, (v) => {
    s.muted = !v;
    ctx.sfx.setMuted(!v);
    if (v) ctx.sfx.tap();
    persist();
  });
  sound.position.set(w / 2 - 26 - 56, y);
  card.addChild(sound);
  y += 58;
  row(y, 'Haptics');
  const hap = new Toggle(s.haptics, (v) => {
    s.haptics = v;
    ctx.haptics.setEnabled(v);
    if (v) ctx.haptics.impact('medium');
    persist();
  });
  hap.position.set(w / 2 - 26 - 56, y);
  card.addChild(hap);
  y += 58;
  row(y, 'Reduce motion');
  const rm = new Toggle(s.reduceMotion, (v) => {
    s.reduceMotion = v;
    persist();
  });
  rm.position.set(w / 2 - 26 - 56, y);
  card.addChild(rm);
  y += 66;
  let armed = false;
  const reset = new Button(
    {
      icon: 'trash',
      label: 'Reset progress',
      width: w - 52,
      height: 50,
      fill: THEME.paperShade,
      color: THEME.accentDark,
      fontSize: 16,
    },
    () => {
      if (!armed) {
        armed = true;
        resetLabel.visible = true;
        return;
      }
      void ctx.save.reset().then(onReset);
    },
  );
  reset.y = y;
  card.addChild(reset);
  const resetLabel = text('Tap again to erase all jobs', { fontSize: 13, fill: THEME.accentDark });
  resetLabel.anchor.set(0.5);
  resetLabel.y = y + 36;
  resetLabel.visible = false;
  card.addChild(resetLabel);
  const done = new Button(
    { icon: 'check', label: 'Done', width: 150, height: 52, fill: THEME.leaf, color: 0xffffff },
    () => close(),
  );
  done.y = h / 2 - 44;
  card.addChild(done);
  root.addChild(dim, card);
  parent.addChild(root);
  const close = (): void => {
    void ctx.tweens
      .add(ctx.motion(0.18), (v) => (root.alpha = 1 - v))
      .promise.then(() => {
        root.destroy({ children: true });
        onClose();
      });
  };
  dim.on('pointertap', close);
  root.alpha = 0;
  void ctx.tweens.add(
    ctx.motion(0.22),
    (v) => {
      root.alpha = v;
      card.scale.set(0.94 + 0.06 * v);
    },
    { ease: ease.outBack },
  );
  ctx.debug.settings = {
    close,
    toggleReduceMotion: () => rm.emit('pointertap', { stopPropagation() {} } as never),
  };
  return root;
}
